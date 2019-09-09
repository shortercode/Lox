class Trie extends Map {
    constructor (itr) {
        super();
        this.value = null;
        if (itr) {
            for (const sym of itr) 
                this.add(sym);
        }
    }
    add (key, value = key) {
        let node = this;

        for (const char of key) {
            let child = node.get(char);
            if (!child) {
                child = new Trie;
                node.set(char, child);
            }
            node = child;
        }

        node.value = value;
    }
    remove (key) {
        if (key.length === 0)
            return;

        const path = [];
        let node = this;

        for (const char of key) {
            const child = node.get(char);
            if (!child) return; // branch doesn't exist - exit
            path.push([node, char]);
            node = child;
        }

        // remove leaf
        node.value = null;

        // no children, remove this branch
        if (node.size === 0) {
            const [ parent, char] = path.pop();
            parent.delete(char);
        }
    }
    find(key) {
        let node = this;
        for (const char of key) {
            node = node.get(char);
            if (!node) return null;
        }
        return node.value;
    }
}

class Iterator {
    constructor (iterable) {
        const itr = iterable[Symbol.iterator]();
        this._iterator = itr;
        this._previous = null;
        this._current = itr.next();
        this._next = itr.next();
        this._future = null;
    }
    next () {
        this._previous = this._current;
        this._current = this._next;
        this._next = this._future || this._iterator.next();
        this._future = null;

        return this._previous;
    }
    incomplete () {
        return !this._current.done;
    }
    consume () {
        return this.next().value;
    }
    back () {
        if (this._previous === null)
            throw new Error("Exceeded step back buffer length");

        this._future = this._next;
        this._next = this._current;
        this._current = this._previous;
        this._previous = null;
    }
    previous () {
        return this._previous && this._previous.value;
    }
    peek () {
        return this._current.value;
    }
    peekNext () {
        return this._next.value;
    }
    [Symbol.iterator] () {
        return this;
    }
}

class CharIterator extends Iterator {
    constructor (str) {
        super (str);
        this.previousPosition = [0, 0];
        this.currentPosition = [0, 0];
    }
    next () {
        const ret = super.next();
        const { value, done } = ret;

        this.previousPosition[0] = this.currentPosition[0];
        this.previousPosition[1] = this.currentPosition[1];

        if (!done) {
            if (value === "\n") {
                this.currentPosition[0]++;
                this.currentPosition[1] = 0;
            }
            else {
                this.currentPosition[1]++;
            }
        }

        return ret;
    }
    position () {
        return this.currentPosition.slice(0);
    }
    back () {
        super.back();

        const temp = this.currentPosition;
        this.currentPosition = this.previousPosition;
        this.previousPosition = temp;
    }
}

/*
    Used by the lexer to buffer the input.
    Text is stored in a static memory block, which is grown when requires
*/
const { TextDecoder } = require("util");

class CharBuffer {
    constructor(pageSize = 2048) {
        this._buffer = new Uint16Array(pageSize);
        this._size = pageSize;
        this._pageSize = pageSize;
        this._index = 0;
        this._decoder = new TextDecoder("utf-16");

        // short length
        this._views = {
            single: this._buffer.subarray(0, 1),
            double: this._buffer.subarray(0, 2),
            triple: this._buffer.subarray(0, 3)
        };
    }
    _reserve(size) {
        const total = this._index + size;
        while (this._size <= total)
            this._growBuffer();
    }
    _growBuffer() {
        // increase recorded buffer size
        this._size += this._pageSize;
        // create replacement
        const replacement = new Uint16Array(this._size);
        // copy old buffer into replacement
        replacement.set(this._buffer);
        // switch the buffers
        this._buffer = replacement;
    }
    push(str) {
        const size = str.length;

        // if we need more space, increase the buffer size
        this._reserve(size);

        const pos = this._index;

        // copy the character codes to the buffer
        // don't use codePointAt here, we want char codes not code points
        for (let i = 0; i < size; i++)
            this._buffer[pos + i] = str.charCodeAt(i);

        // increase the index position
        this._index += size;
    }
    back (l) {
        this._index -= l;
    }
    index () {
        return this._index;
    }
    splice(target, text) {
        if (target > this._index)
            throw new Error("Unable to splice text ahead of the write head");
        const size = text.length;
        this._reserve(size);
        this._buffer.copyWithin(target + size, target, this._index);
        for (let i = 0; i < size; i++)
            this._buffer[target + i] = text.charCodeAt(i);
        this._index += size;
        return size;
    }
    consume() {
        if (this._index == 0)
            return "";

        let subview;

        switch (this._index) {
            case 1:
                subview = this._views.single;
                break;
            case 2:
                subview = this._views.double;
                break;
            case 3:
                subview = this._views.triple;
                break;
            default:
                subview = this._buffer.slice(0, this._index);
                break;
        }

        this._index = 0;
        return this._decoder.decode(subview);
    }
}

class SyntaxError extends Error {
  constructor (ln, column, msg, label) {
    super(`${msg} @ ${ln}:${column} "${label}"`);
  }
  toString () {
    return `SyntaxError: ${this.message}`;
  }
  static UnexpectedToken (token, label) {
    const { type, value, start: [ln, column] } = token;
    throw new SyntaxError(ln, column, `unexpected token "${type}:${value}"`, label);
  }
  static InvalidToken ([ln, column], value, label) {
    throw new SyntaxError(ln, column, `invalid or unexpected token "${value}"`, label);
  }
  static UnexpectedEndOfInput ([ln, column], label) {
    throw new SyntaxError(ln, column, "unexpected end of input", label);
  }
  static UnterminatedStringLiteral ([ln, column], label) {
    throw new SyntaxError(ln, column, "unterminated string literal", label);
  }
}

class Token {
    constructor (type, value, start, end) {
        this.start = start;
        this.end = end;
        this.type = type;
        this.value = value;
        this.newline = false;
    }
    match (type, value = "") {
        return this.type === type && ( value === "" || value === this.value);
    }
}

class Scanner {
    constructor (symbols) {        
        this.symbols = symbols;
    }

    *scan (str, label) {
        const source = new CharIterator(str);
        const buffer = new CharBuffer();
        let previousToken;

        do {
            let token = null;

            if (this.isIdentifier(source))
                token = this.scanIdentifier(source, buffer);

            else if (this.isNumber(source))
                token = this.scanNumber(source, buffer);

            else if (this.isString(source))
                token = this.scanString(source, buffer, label);

            else if (this.isSymbol(source))
                token = this.scanSymbol(source, buffer, label);

            else if (this.isWhitespace(source))
                source.consume();
                
            else
                SyntaxError.InvalidToken(source.position(), source.peek(), label);

            if (token)
                yield previousToken = this.checkNewline(previousToken, token);
        }
        while (source.incomplete())
    }

    isIdentifier (source) {
        const ch = source.peek();
        return /^[_a-z]$/i.test(ch);
    }
    isSymbol (source) {
        const ch = source.peek();
        return this.symbols.has(ch);
    }
    isNumber (source) {
        const ch = source.peek();
        return /^[0-9]$/.test(ch);
    }
    isString (source) {
        const ch = source.peek();
        return ch === "\"";
    }
    isWhitespace (source) {
        const ch = source.peek();
        return /^\s$/.test(ch);
    }

    scanIdentifier (source, buffer) {
        const start = source.position();
        for (const ch of source) {
            buffer.push(ch);

            if (this.isIdentifier(source) === false && this.isNumber(source) === false)
                return new Token("identifier", buffer.consume(), start, source.position());
        }
    }
    scanNumber (source, buffer) {
        const start = source.position();
        for (const ch of source) {
            buffer.push(ch);

            if (!this.isNumber(source))
                break;
        }
    
        if (source.peek() === ".") {
            source.consume();
            if (this.isNumber(source))
            {
                buffer.push(".");
                if (this.isNumber(source)) {
                    for (const ch of source) {
                        buffer.push(ch);
                        
                        if (!this.isNumber(source))
                            break;
                    }
                }
            }
            else {
                source.back();
            }
        }

        return new Token("number", buffer.consume(), start, source.position());
    }
    scanString (source, buffer, label) {
        const start = source.position();
        source.next(); // consume quote mark
        let isTextEscaped = false;

        for (const ch of source) {
            if (ch != "\"" || isTextEscaped == true) {
                if (isTextEscaped) {
                    isTextEscaped = false;
                    buffer.push(ch);
                } else {
                    if (ch == "\\")
                        isTextEscaped = true;
                    else
                        buffer.push(ch);
                }
            } else {
    
                return new Token(
                    "string",
                    buffer.consume(),
                    start,
                    source.position()
                );
            }
        }

        SyntaxError.UnterminatedStringLiteral(source.position(), label);
    }
    scanLineComment (source, buffer) {
        source.next();
        source.next();
        for (const ch of source) {
            if (ch === "\n") {
                // optional comment token here?
                return;
            }
        }
    }
    scanComment (source, buffer) {
        source.next();
        source.next();
        for (const ch of source) {
            if (ch === "*" && source.peek() === "/") {
                source.next(); // consume slash
                // optional comment token here?
                return;
            }
        }
    }
    scanSymbol (source, buffer, label) {
        let trie = this.symbols;

        if (source.peek() === "/") {
            const next = source.peekNext();

            if (next === "*")
                return this.scanComment(source, buffer);
            else if (next === "/")
                return this.scanLineComment(source, buffer);
        }

        const start = source.position();

        for (const ch of source) {
            const next = trie.get(ch);

            if (!next) {
                source.back();
                if (!trie.value)
                    SyntaxError.InvalidToken(source.position(), source.next(), label);
                break;
            }
            
            trie = next;
        }

        const value = trie.value;
        if (!value)
            Syntax.UnexpectedEndOfInput(source.position(), label);

        return new Token("symbol", value, start, source.position());
    }

    checkNewline (previous, token) {
        if (!previous || previous.end[0] < token.end[0])
            token.newline = true;
        return token;
    }
}

class Parselet {
    constructor (precedence, fn) {
        this.precedence = precedence;
        this.parse = fn;
    }
}

class Node {
    constructor (type, start, end, data) {
        if (Array.isArray(start) === false)
            throw new TypeError("Expected tuple");
        if (Array.isArray(end) === false)
            throw new TypeError("Expected tuple");
        if (typeof type !== "string")
            throw new TypeError("Expected string");
        this.type = type;
        this.data = data;
        this.start = start;
        this.end = end;
    }
    toString () {
        return `(${this.type} ${this.data})`;
    }
}

// it's safe to define symbols ahead of time, provided we throw a matching
// error if no parselet is found for the token

const SYMBOL_LIST = [
    "!",
    "=", ":=",
    "{", "}",
    "(", ")",
    ".", ",",
    "[", "]",
    "+", "-", "/", "*", "**",
    "<", ">", "<<", ">>", "<<<", ">>>",
    "+=", "/=", "-=", "*=", "**=", 
    "%", "^", "&", ":", "|", "~", "?", ";",
    "??", "||", "&&", "::", "..", 
    "<=", ">=", "=>", "->",
    "==", "===", "!==", "!="
];

class Parser {
    constructor () {
        this.symbols = new Trie(SYMBOL_LIST);
        this.prefix = new Map;
        this.infix = new Map;
        this.statement = new Map;
        this.scanner = new Scanner(this.symbols);

        this.label = "";
    }

    // public setup functions

    addStatement (label, fn) {
        const parselet = new Parselet(0, fn.bind(this));
        this.statement.set(label, parselet);
        return this;
    }
    addPrefix (label, precedence, fn) {
        const parselet = new Parselet(precedence, fn.bind(this));
        this.prefix.set(label, parselet);
        return this;
    }
    addInfix (label, precedence, fn) {
        const parselet = new Parselet(precedence, fn.bind(this));
        this.infix.set(label, parselet);
        return this;
    }
    addSymbol (str) {
        this.symbols.add(str);
    }
    removeSymbol () {
        this.symbols.remove(str);
    }

    parseProgram (str, label = "") {

        this.label = label + "";

        const tokens = new Iterator(this.scanner.scan(str, this.label));
        const stmts = [];

        // early bail here if there are no tokens
        if (!tokens.incomplete()) {
            const pos = [0, 0];
            return this.createNode("module", pos, pos, stmts);
        }

        const start = tokens.peek().start;
        
        while ( tokens.incomplete() ) {
            const stmt = this.parseStatement(tokens);
            stmts.push(stmt);
        }

        const end = tokens.previous().end;

        return this.createNode("module", start, end, stmts);
    }
    parseStatement (tokens) {
        const parselet = this.getStatement(tokens);

        if (parselet)
            return parselet.parse(tokens);
        else {
            tokens.back();
            const start = tokens.peek().start;
            const expression = this.parseExpression(tokens); 
            const end = this.endStatement(tokens);
            const stmt = this.createNode("expression", start, end, expression);
            return stmt;
        }
    }
    parseExpression (tokens, precedence = 0) {
        let parselet = this.getPrefix(tokens);

        if (!parselet)
            this.throwUnexpectedToken(tokens.previous());

        let left = parselet.parse(tokens, parselet.precedence);

        while (precedence < this.getPrecedence(tokens)) {
            parselet = this.getInfix(tokens);
            left = parselet.parse(tokens, left, parselet.precedence);
        }

        return left;
    }

    // private functions

    getPrefix (tokens) {
        return this.getParselet(this.prefix, tokens.consume());
    }
    getInfix (tokens) {
        return this.getParselet(this.infix, tokens.consume());
    }
    getStatement (tokens) {
        return this.getParselet(this.statement, tokens.consume());
    }
    getPrecedence (tokens) {
        const isEnd = tokens.incomplete();
        const parselet = isEnd ? this.getParselet(this.infix, tokens.peek()) : null;
        return parselet ? parselet.precedence : 0;
    }
    getParselet (collection, token) {
        const { type, value } = token;
        return collection.get(type + ":" + value) || collection.get(type + ":");
    }

    // helpers for errors

    throwUnexpectedToken (token) {
        SyntaxError.UnexpectedToken(token, this.label);
    }

    throwSyntaxError (ln, col, msg) {
        throw new SyntaxError(ln, col, msg, this.label);
    }

    throwUnexpectedEndOfInput (tokens) {
        const last = tokens.previous();
        SyntaxError.UnexpectedEndOfInput(last.end, this.label);
    }

    // helper functions for common parsing methods

    binary (type) {
        return function (tokens, left, precedence) {
            const right = this.parseExpression(tokens, precedence);
            const end = tokens.previous().end;
            return this.createNode(type, left.start, end, { left, right });
        }
    }

    unary (type) {
        return function (tokens, precedence) {
            const start = tokens.previous().start;
            const expression = this.parseExpression(tokens, precedence);
            const end = tokens.previous().end;
            return this.createNode(type, start, end, expression); 
        }
    }

    literal (type) {
        return function (tokens) {
            const token = tokens.previous();
            const { value, start, end } = token;

            return this.createNode(type, start, end, value); 
        }
    }

    // token utilities

    createNode (type, start, end, data) {
        return new Node(type, start, end, data);
    }

    readLabel (label) {
        const i = label.indexOf(":");
    
        const type = label.slice(0, i);
        const value = label.slice(i + 1);
    
        return [ type, value ];
    }

    match (tokens, label) {
        const token = tokens.peek();
        const [ type, value ] = this.readLabel(label);

        return token.match(type, value);
    }

    ensure (tokens, label) {
        if (!tokens.incomplete())
            this.throwUnexpectedEndOfInput(tokens);

        if (!this.match(tokens, label))
            this.throwUnexpectedToken(tokens.peek());

        return tokens.consume().value; // always matches at least the type, so return the value ( more useful )
    }

    shouldEndStatement (tokens) {
        const token = tokens.peek();

        return (!token) || token.newline || token.match("symbol", ";");
    }
    
    endStatement (tokens) {
        const token = tokens.peek();
        if (!token)
            return tokens.previous().end;
        if (token.match("symbol", ";")) {
            tokens.next();
            return token.end;
        }
        if (token.newline)
            return tokens.previous().end;

        this.throwUnexpectedToken(token);
    }
}

class Walker {
    constructor () {
        this._expressions = new Map;
        this._statements = new Map;
    }

    walk (stmt, ctx) {
        this.walkStatement(stmt, ctx);
    }

    defineStatement(k, v) {
        this._statements.set(k, v.bind(this));
    }
    defineExpression(k, v) {
        this._expressions.set(k, v.bind(this));
    }

    walkStatement (stmt, ctx) {
        const fn = this._statements.get(stmt.type);
        if (!fn) throw new Error(`No handler for statement type ${stmt.type}`);
        return fn(stmt.data, ctx);
    }
    
    walkExpression (expr, ctx) {
        const fn = this._expressions.get(expr.type);
        if (!fn) throw new Error(`No handler for expression type ${expr.type}`);
        return fn(expr.data, ctx);
    }
}

export { Scanner, Parser, Walker };
