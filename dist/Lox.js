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

        while (source.incomplete()) {
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
            else if (source.incomplete()){
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

        if (!token) return false;

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

class RuntimeError extends Error {
  toString() {
    return `RuntimeError: ${this.message}`;
  }
  static undefined (name) {
    throw new RuntimeError(`Undefined variable '${name}'.`)
  }
}

class LoxFunction {
  constructor (name, parameters, block, scope) {
      this.parameters = parameters;
      this.block = block;
      this.scope = scope;
      this.name = name;
  }
  toString () {
    return `<fn ${this.name}>`;
  }
  isBound () {
    return false;
  }
  bind (inst) {
    return new BoundFunction(this, inst);
  }
  bindInit (inst) {
    return new BoundInitialiserFunction(this, inst);
  }
  call (args, ctx, walkStmt) {
    const a = args.length;
    const b = this.parameters.length;

    if (a !== b)
      throw new RuntimeError(`Expected ${b} arguments but got ${a}.`);

    const newScope = this.scope.slice(0);
    const oldScope = ctx.swapScope(newScope);
    
    ctx.pushCall();
    ctx.push();

    const env = newScope[0];

    if (this instanceof BoundFunction) {
      env.set("this", this.instance);
    }

    for (let i = 0; i < a; i++) {
      const name = this.parameters[i];
      env.set(name, args[i]);
    }

    for (const stmt of this.block.data) {
      walkStmt(stmt, ctx);
      if (ctx.shouldReturn())
          break;
    }

    ctx.pop();
    ctx.swapScope(oldScope);

    return ctx.popCall();
  }
}

class BoundFunction extends LoxFunction {
  constructor (fn, inst) {
      super(fn.name, fn.parameters, fn.block, fn.scope);
      this.instance = inst;
  }
  isBound () {
    return true;
  }
}

class BoundInitialiserFunction extends BoundFunction {
  call (args, ctx, walkStmt) {
    const returnValue = super.call(args, ctx, walkStmt);
    if (returnValue != null)
      throw new RuntimeError("Cannot return a value from an initializer.");
    return this.instance; 
  }
}

class Class {
  constructor (name, superClass, definitions, scope) {
      this.name = name;
      this.definitions = new Map(definitions);
      this.superClass = superClass;
  }
  get (name) {
    return this.definitions.get(name) || (this.superClass ? this.superClass.get(name) : undefined);
  }
  toString () {
    return this.name;
  }
}

class Instance {
  constructor (cls) {
    this.properties = new Map;
    this.class = cls;
  }
  get (name, allowUndefined = false) {
    let p;
    if (this.properties.has(name))
      p = this.properties.get(name);
    else
      p = this.class.get(name);

    if (p === undefined) {
      if (allowUndefined)
        return p;
      else
        throw new RuntimeError(`Undefined property '${name}'.`);
    } 

    if (p instanceof LoxFunction) {
      if (p.isBound())
        return p;
      if (name === "init")
        return p.bindInit(this);
      else
        return p.bind(this);
    }

    return p;
  }
  set (name, value) {
    this.properties.set(name, value);
  }
  toString () {
    return `${this.class.toString()} instance`
  }
}

const ensureNumber = a => {
    if (typeof a != "number")
        throw new RuntimeError("Operand must be a number.");
};
const ensureNumbers = (a, b) => {
    if (typeof a != "number" || typeof b != "number")
        throw new RuntimeError("Operands must be numbers.");
};

const ensureNumbersOrStrings = (a, b) => {
    const A = typeof a, B = typeof b;
    if (A != B)
        throw new RuntimeError("Operands must be two numbers or two strings.");
    if (A != "string" && A != "number")
        throw new RuntimeError("Operands must be two numbers or two strings.");
};

const binary = new Map(Object.entries({
    ",": (a, b) => b,
    "==": (a, b) =>  a === b,
    "!=": (a, b) => a !== b,
    "+": (a, b) => (ensureNumbersOrStrings(a, b), a + b),
    "-": (a, b) => (ensureNumbers(a, b), a - b),
    "/": (a, b) => (ensureNumbers(a, b), a / b),
    "*": (a, b) => (ensureNumbers(a, b), a * b),
    "<": (a, b) => (ensureNumbers(a, b), a < b),
    ">": (a, b) => (ensureNumbers(a, b), a > b),
    "<=": (a, b) => (ensureNumbers(a, b), a <= b),
    ">=": (a, b) => (ensureNumbers(a, b), a >= b)
}));

const unary = new Map(Object.entries({
    "minus": a => (ensureNumber(a), -a),
    "!": a => !isTruthy(a)
}));

function assert(test, str) {
    if (!test)
        throw new Error(str);
}

function isTruthy (value) {
    if (value === null) return false;           
    if (value === false) return false;
    return true;
}

class LoxInterpreter extends Walker {
    constructor () {
        super(); 

        this.boundWalkStatement = this.walkStatement.bind(this);

        this.defineStatement("module",  this.walkModule);
        this.defineStatement("function", this.walkFunction);
        this.defineStatement("class", this.walkClass);
        this.defineStatement("variable", this.walkVariable);
        this.defineStatement("expression", this.walkExpression);
        this.defineStatement("return",this.walkReturn);
        this.defineStatement("print", this.walkPrint);
        this.defineStatement("if", this.walkIf);
        this.defineStatement("while", this.walkWhile);
        this.defineStatement("for", this.walkFor);
        this.defineStatement("block", this.walkBlock);
        this.defineStatement("blank", (stmt, ctx) => {});

        this.defineExpression(",",  (expr, ctx) => this.walkBinaryExpression(",",   expr, ctx));
        this.defineExpression("?",  this.walkConditionalExpression);
        this.defineExpression("or", (expr, ctx) => this.walkLogicalBinaryExpression("or",   expr, ctx));
        this.defineExpression("and",(expr, ctx) => this.walkLogicalBinaryExpression("and",   expr, ctx));
        this.defineExpression("==", (expr, ctx) => this.walkBinaryExpression("==",  expr, ctx));
        this.defineExpression("!=", (expr, ctx) => this.walkBinaryExpression("!=",  expr, ctx));
        this.defineExpression("<",  (expr, ctx) => this.walkBinaryExpression("<",   expr, ctx));
        this.defineExpression(">",  (expr, ctx) => this.walkBinaryExpression(">",   expr, ctx));
        this.defineExpression("<=", (expr, ctx) => this.walkBinaryExpression("<=",  expr, ctx));
        this.defineExpression(">=", (expr, ctx) => this.walkBinaryExpression(">=",  expr, ctx));
        this.defineExpression("+",  (expr, ctx) => this.walkBinaryExpression("+",   expr, ctx));
        this.defineExpression("-",  (expr, ctx) => this.walkBinaryExpression("-",   expr, ctx));
        this.defineExpression("*",  (expr, ctx) => this.walkBinaryExpression("*",   expr, ctx));
        this.defineExpression("/",  (expr, ctx) => this.walkBinaryExpression("/",   expr, ctx));

        this.defineExpression("!",  (expr, ctx) => this.walkUnaryExpression("!",    expr, ctx));
        this.defineExpression("minus",  (expr, ctx) => this.walkUnaryExpression("minus",    expr, ctx));

        this.defineExpression("grouping", (expr, ctx) => this.walkExpression(expr, ctx));
        this.defineExpression("number", (expr, ctx) => Number(expr));
        this.defineExpression("string", (expr, ctx) => String(expr));
        this.defineExpression("boolean", (expr, ctx) => expr === "true");
        this.defineExpression("member", this.walkMemberExpression);
        this.defineExpression("computed", this.walkComputedExpression);
        this.defineExpression("set", this.walkSetExpression);
        this.defineExpression("computed-set", this.walkComputedSetExpression);
        this.defineExpression("assignment", this.walkAssignmentExpression);
        this.defineExpression("?",  this.walkConditionalExpression);
        this.defineExpression("call", this.walkCallExpression);
        this.defineExpression("identifier", (expr, ctx) => ctx.get(expr.value, expr));
        this.defineExpression("context", (expr, ctx) => ctx.get(expr.value, expr));
        this.defineExpression("super", this.walkSuperExpression);
        this.defineExpression("blank", (expr, ctx) => null);
    }
    walkModule (stmts, ctx) {
        for (const stmt of stmts) {
            this.walkStatement(stmt, ctx);
        }
    }
    walkFunction (stmt, ctx) {
        const { parameters, block, name } = stmt;
        const fn = new LoxFunction(name, parameters, block, ctx.copyScope());
        ctx.set(name, stmt, fn);
    }
    walkClass (stmt, ctx) {
        const { name, superClass, methods } = stmt;
        const definitions = [];
        let parent = null;

        if (superClass) {
            const superName = superClass.name;
            if (superName === name)
                throw new RuntimeError(`A class cannot inherit from itself.`);
            parent = ctx.get(superName, superClass);

            if (parent instanceof Class == false)
                throw new RuntimeError("Superclass must be a class.");
            ctx.push();
            ctx.scope[0].set("super", parent);
        }

        const scope = ctx.copyScope();

        for (const method of methods) {
            const { parameters, name, block } = method;
            const fn = new LoxFunction(name, parameters, block, scope);
            definitions.push([ name, fn ]);
        }

        if (superClass)
            ctx.pop();

        const ctor = new Class(name, parent, definitions);
        ctx.set(name, stmt, ctor);
    }
    walkVariable (stmt, ctx) {
        const { initialiser, name } = stmt;
        const value = this.walkExpression(initialiser, ctx);
        ctx.set(name, stmt, value);
    }
    walkReturn (stmt, ctx) {
        ctx.return(this.walkExpression(stmt, ctx));
    }
    walkPrint (stmt, ctx) {
        const result = this.walkExpression(stmt, ctx);
        if (result == null)
            ctx.print("nil");
        else if (Object.is(result, -0))
            ctx.print("-0");
        else
            ctx.print(result.toString());
    }
    walkIf (stmt, ctx) {
        const { condition, thenStatement, elseStatement } = stmt;
        const test = this.walkExpression(condition, ctx);
        const result = isTruthy(test) ? thenStatement : elseStatement;
        this.walkStatement(result, ctx);
    }
    walkWhile (stmt, ctx) {
        const { condition, thenStatement } = stmt;
        ctx.push();
        while (isTruthy(this.walkExpression(condition, ctx))) {
            ctx.push();
            this.walkStatement(thenStatement, ctx);
            ctx.pop();
            if (ctx.shouldReturn())
                break;
        }
        ctx.pop();
    }
    walkFor (stmt, ctx) {
        const { setup, condition, step, thenStatement } = stmt;

        ctx.push();
        this.walkStatement(setup, ctx);

        while (isTruthy(this.walkStatement(condition, ctx))) {
            ctx.push();
            this.walkStatement(thenStatement, ctx);
            ctx.pop();
            if (ctx.shouldReturn())
                break;
            this.walkStatement(step, ctx);
        }
        ctx.pop();
    }
    walkBlock (stmt, ctx) {
        ctx.push();
        for (const sub of stmt) {
            this.walkStatement(sub, ctx);
            if (ctx.shouldReturn())
                break;
        }
        ctx.pop();
    }
    walkLogicalBinaryExpression (operator, expr, ctx) {
        const { left, right } = expr;

        const a = this.walkExpression(left, ctx);
        // both "or" and "and" are shortcircuit style operators
        switch (operator) {
            case "or": {
                    if (isTruthy(a)) return a;
                    return this.walkExpression(right, ctx);
                }
            case "and": {
                    if (!isTruthy(a)) return a;
                    return this.walkExpression(right, ctx);
                }
        }
    }
    walkBinaryExpression (operator, expr, ctx) {
        const { left, right } = expr;

        const a = this.walkExpression(left, ctx);

        const b = this.walkExpression(right, ctx);
        const method = binary.get(operator);

        assert(method, "Illegal operator");

        return method(a, b);
    }
    walkUnaryExpression (operator, expr, ctx) {

        const a = this.walkExpression(expr, ctx);
        const method = unary.get(operator);

        assert(method, "Illegal operator");

        return method(a);
    }
    walkMemberExpression (expr, ctx) {
        const { left, name } = expr;
        const inst = this.walkExpression(left, ctx);

        assert(inst instanceof Instance, "Only instances have properties.");
        // assert(inst instanceof Instance, `cannot access property ${name} of non-object`);
        return inst.get(name);
    }
    walkComputedExpression (expr, ctx) {
        const { left, expression } = expr;
        const name = this.walkExpression(expression, ctx);
        const inst = this.walkExpression(left, ctx);
        assert(inst instanceof Instance, "Only instances have properties.");
        // assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        return inst.get(name);
    }
    walkSetExpression (expr, ctx) {
        const { left, right, name } = expr;
        const inst = this.walkExpression(left, ctx);

        assert(inst instanceof Instance, "Only instances have fields.");
        // assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        const value = this.walkExpression(right, ctx);
        inst.set(name, value);
        return value;
    }
    walkComputedSetExpression (expr, ctx) {
        const { left, right, expression } = expr;
        const name = this.walkExpression(expression, ctx);
        const inst = this.walkExpression(left, ctx);

        assert(inst instanceof Instance, "Only instances have fields.");
        // assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        const value = this.walkExpression(right, ctx);
        inst.set(name, value);
        return value;
    }
    walkAssignmentExpression (expr, ctx) {
        const { name, right } = expr;
        const value = this.walkExpression(right, ctx);

        ctx.set(name, expr, value);

        return value;
    }
    walkConditionalExpression (expr, ctx) {
        const { condition, thenExpr, elseExpr } = expr;
        if (isTruthy(this.walkExpression(condition, ctx)))
            return this.walkExpression(thenExpr, ctx);
        else
            return this.walkExpression(elseExpr, ctx);
    }
    walkCallExpression (expr, ctx) {
        const { left, args } = expr;
        const fn = this.walkExpression(left, ctx);

        const values = args.map(arg => this.walkExpression(arg, ctx));

        if (fn instanceof LoxFunction)
            return ctx.callFunction(fn, values, this.boundWalkStatement);

        else if (fn instanceof Class) {
            const inst = new Instance(fn);
            const init = inst.get("init", true);
            
            if (init)
                ctx.callFunction(init, values, this.boundWalkStatement);
            else if (values.length > 0)
                throw new RuntimeError(`Expected 0 arguments but got ${values.length}.`);

            return inst;
        }

        else
            throw new RuntimeError(`Can only call functions and classes.`);
    }
    walkSuperExpression (expr, ctx) {
        const superclass = ctx.get("super", expr);
        const property = superclass.get(expr.name);
        assert(property instanceof LoxFunction, `Undefined property '${expr.name}'.`); // TODO improve error message
        
        // we have nothing to use to resolve the location of "this"
        // however we know that it exists 1 environment closer than super
        // so we resolve the scope with an offset, then look in that
        const scope = ctx.resolve(expr, -1);
        const inst = scope.get("this");

        return property.bind(inst);
    }
}

const RESERVED_NAMES = new Set([
   "fun",
   "class",
   "var",
   "return",
   "print",
   "if",
   "else",
   "while",
   "for",
   "and",
   "or",
   "true",
   "false",
   "this",
   "nil",
   "super" 
]);

class LoxParser extends Parser {
    constructor () {
        super();
        this.addStatement("identifier:fun",     this.parseFunctionStmt);
        this.addStatement("identifier:class",   this.parseClassStmt);
        this.addStatement("identifier:var",     this.parseVarStmt);
        this.addStatement("identifier:return",  this.parseReturnStmt);
        this.addStatement("identifier:print",   this.parsePrintStmt);
        this.addStatement("identifier:if",      this.parseIfStmt);
        this.addStatement("identifier:while",   this.parseWhileStmt);
        this.addStatement("identifier:for",     this.parseForStmt);
        this.addStatement("symbol:{",           this.parseBlockStmt);
        this.addStatement("symbol:;",           this.parseBlank);
        // sequence
        this.addInfix("symbol:,",           1,  this.binary(","));
        // assignment
        this.addInfix("symbol:=",           2,  this.parseAssignentExpression);
        // ternary conditional
        this.addInfix("symbol:?",           3,  this.parseTernaryConditional);
        // logical or
        this.addInfix("identifier:or",      4,  this.binary("or"));
        // logical and
        this.addInfix("identifier:and",     5,  this.binary("and"));
        // equality
        this.addInfix("symbol:==",          6,  this.binary("=="));
        this.addInfix("symbol:!=",          6,  this.binary("!="));
        // comparison
        this.addInfix("symbol:<",           7,  this.binary("<"));
        this.addInfix("symbol:>",           7,  this.binary(">"));
        this.addInfix("symbol:<=",          7,  this.binary("<="));
        this.addInfix("symbol:>=",          7,  this.binary(">="));
        // add/sub
        this.addInfix("symbol:+",           8,  this.binary("+"));
        this.addInfix("symbol:-",           8,  this.binary("-"));
        // mult/div
        this.addInfix("symbol:/",           9,  this.binary("/"));
        this.addInfix("symbol:*",           9,  this.binary("*"));
        // unary not
        this.addPrefix("symbol:!",          10,  this.unary("!"));
        // unary minus
        this.addPrefix("symbol:-",          10,  this.unary("minus"));
        // call function
        this.addInfix("symbol:(",           11, this.parseCallExpression);
        // subscript ( computed member )
        this.addInfix("symbol:[",           11, this.parseSubscriptExpression);
        // member
        this.addInfix("symbol:.",           11, this.parseMemberExpression);
        // grouping
        this.addPrefix("symbol:(",          12, this.parseGroupingExpression);

        this.addPrefix("number:",           13, this.literal("number"));
        this.addPrefix("string:",           13, this.literal("string"));
        this.addPrefix("identifier:",       13, this.parseIdentifier);
        this.addPrefix("identifier:true",   13, this.literal("boolean"));
        this.addPrefix("identifier:false",  13, this.literal("boolean"));
        this.addPrefix("identifier:super",  13, this.parseSuperExpression);
    }
    parseNotDeclaration (tokens) {
        const stmt = this.parseStatement(tokens);
        switch (stmt.type) {
            case "function":
            case "class":
            case "variable":
                throw new Error("Expect expression.");
                break;
            default:
                return stmt;
        }
    }
    parseFunctionStmt (tokens) {
        const start = tokens.previous().start;
        const name = this.ensure(tokens, "identifier:");
        const parameters = [];
        this.ensure(tokens, "symbol:(");

        if (RESERVED_NAMES.has(name))
            throw new RuntimeError("Expect function name.");

        while (!this.match(tokens, "symbol:)"))
        {
            const param = this.ensure(tokens, "identifier:");
            parameters.push(param);

            if (this.match(tokens, "symbol:,"))
                tokens.next();
            else if (this.match(tokens, "symbol:)"))
                break;
            else
                throw new RuntimeError("Expect ')' after parameters.");
        }

        this.ensure(tokens, "symbol:)");

        if (this.match(tokens, "symbol:{")) {
            // tokens.back();
            const block = this.parseBlock(tokens);
            const end = tokens.previous().end;

            return this.createNode("function", start, end, { name, parameters, block });
        }
        else
            throw new RuntimeError("Expect '{' before function body.");
    }
    parseClassStmt (tokens) {
        const start = tokens.previous().start;
        const name = this.ensure(tokens, "identifier:");
        const methods = [];
        let superClass = null;

        if (RESERVED_NAMES.has(name))
            throw new RuntimeError("Expect class name.");

        if (this.match(tokens, "symbol:<"))
        {
            tokens.next();
            if (!this.match(tokens, "identifier:")) 
                throw new RuntimeError("Expect superclass name.");
                
            superClass = {
                name: this.ensure(tokens, "identifier:")
            };
        }
        
        this.ensure(tokens, "symbol:{");

        if (!this.match(tokens, "symbol:}"))
        {
            while (true) {
                const name = this.ensure(tokens, "identifier:");
                const parameters = [];

                this.ensure(tokens, "symbol:(");

                if (!this.match(tokens, "symbol:)"))
                {
                    while (true) {
                        const param = this.ensure(tokens, "identifier:");
                        parameters.push(param);

                        if (this.match(tokens, "symbol:,"))
                            tokens.next();
                        else if (this.match(tokens, "symbol:)"))
                            break;
                        else
                            throw new RuntimeError("Expect ')' after parameters.");
                    }
                }

                this.ensure(tokens, "symbol:)");

                const block = this.parseBlock(tokens);
                
                methods.push({ name, parameters, block });

                if (this.match(tokens, "symbol:}"))
                    break;
            }
        }

        this.ensure(tokens, "symbol:}");
        const end = tokens.previous().end;

        return this.createNode("class", start, end, { name, superClass, methods });
    }
    parseVarStmt (tokens) {
        const start = tokens.previous().start;
        const name = this.ensure(tokens, "identifier:");
        let initialiser;

        if (RESERVED_NAMES.has(name))
            throw new RuntimeError("Expect variable name.");
    
        if (this.match(tokens, "symbol:=")) {
            tokens.next();
            initialiser = this.parseExpression(tokens);
        }
        else {
            initialiser = this.parseBlank(tokens);
        }
    
        this.endStatement(tokens);
        const end = tokens.previous().end;
    
        return this.createNode("variable", start, end, { name, initialiser });
    }
    parseReturnStmt (tokens) {
        const start = tokens.previous().start;
        let expression;
        if (!this.shouldEndStatement(tokens))
            expression = this.parseExpression(tokens);
        else
            expression = this.parseBlank(tokens);

        this.endStatement(tokens);
        const end = tokens.previous().end;

        return this.createNode("return", start, end, expression);
    }
    parsePrintStmt (tokens) {
        const start = tokens.previous().start;
        let expression;

        if (!this.shouldEndStatement(tokens))
            expression = this.parseExpression(tokens);
        else
            throw new RuntimeError("Expect expression.");

        this.endStatement(tokens);
        const end = tokens.previous().end;

        return this.createNode("print", start, end, expression);
    }
    parseIfStmt (tokens) {
        const start = tokens.previous().start;
        // parse condition

        this.ensure(tokens, "symbol:(");

        const condition = this.parseExpression(tokens);

        this.ensure(tokens, "symbol:)");

        // parse thenStatement

        const thenStatement = this.parseNotDeclaration(tokens);

        // check for elseStatement
        let elseStatement;

        if (this.match(tokens, "identifier:else")) {
            tokens.next();
            elseStatement = this.parseNotDeclaration(tokens);
        }
        else {
            elseStatement = this.parseBlank(tokens);
        }

        const end = tokens.previous().end;

        return this.createNode("if", start, end, {
            condition,
            thenStatement,
            elseStatement
        });
    }
    parseWhileStmt (tokens) {
        const start = tokens.previous().start;
        // parse condition

        this.ensure(tokens, "symbol:(");

        const condition = this.parseExpression(tokens);

        this.ensure(tokens, "symbol:)");

        // parse thenStatement

        const thenStatement = this.parseNotDeclaration(tokens);
        const end = tokens.previous().end;

        return this.createNode("while", start, end, {
            condition,
            thenStatement
        });
    }
    parseForStmt (tokens) {
        const start = tokens.previous().start;
        this.ensure(tokens, "symbol:(");

        let setup = null;
        let condition = null;
        let step = null;

        setup = this.parseStatement(tokens);

        switch (setup.type) {
            case "variable":
            case "blank":
            case "expression":
                break;
            default:
                throw new RuntimeError("Expect expression.");
        }


        if (this.match(tokens, "symbol:;")) {
            tokens.next();
            const position = tokens.peek().start;
            condition = this.createNode(
                "expression",
                position,
                position,
                this.createNode("boolean", position, position, "true")
            );
        }
        else {
            condition = this.parseStatement(tokens);

            if (condition.type !== "expression")
                throw new RuntimeError("Expect expression.");
        }

        if (this.match(tokens, "symbol:)")) {
            step = this.parseBlank(tokens);
        }
        else {
            const next = tokens.peek();

            if (next) {
                const { type, value } = next;
                if (type === "identifier") {
                    if (value === "fun" 
                        || value === "class" 
                        || value === "var" 
                        || value === "return"
                        || value === "print"
                        || value === "if"
                        || value === "while"
                        || value === "for"
                    )
                        throw new RuntimeError("Expect expression.");
                }
                else if (type === "symbol") {
                    if (value === "{" || value === ";")
                        throw new RuntimeError("Expect expression.");
                }
            }

            let expr = this.parseExpression(tokens);
            step = this.createNode("expression", expr.start, expr.end, expr);
        }

        this.ensure(tokens, "symbol:)");

        const thenStatement = this.parseNotDeclaration(tokens);
        const end = tokens.previous().end;

        return this.createNode("for", start, end, {
            setup,
            condition,
            step,
            thenStatement
        });
    }
    parseBlockStmt (tokens) {
        // NOTE parseBlock expects to start with a "{" but the statement matcher
        // consumes it, so step the iterator back
        tokens.back();
        return this.parseBlock(tokens);
    }
    parseBlank (tokens) {
        // no guarentee that there will be a next token, so just use the last
        // position
        const position = tokens.previous().end;
        return this.createNode("blank", position, position, null);
    }
    parseBlock (tokens) {
        
        this.ensure(tokens, "symbol:{");
        const statements = [];
        const start = tokens.previous().start;
    
        while (!this.match(tokens, "symbol:}")) {
            statements.push(this.parseStatement(tokens));
        }
    
        this.ensure(tokens, "symbol:}");
        const end = tokens.previous().end;
    
        return this.createNode("block", start, end, statements);
    }
    parseAssignentExpression (tokens, left) {
        const start = tokens.previous().start;
        const right = this.parseExpression(tokens, 1);
        const end = tokens.previous().end;

        switch (left.type) {
            case "member":
                return this.createNode("set", start, end, {
                    left: left.data.left,
                    name: left.data.name,
                    right
                });
            case "computed":
                return this.createNode("computed-set", start, end, {
                    left: left.data.left,
                    expression: left.data.expression,
                    right
                });
            case "identifier":
                return this.createNode("assignment", start, end, {
                    name: left.data.value,
                    right
                });
            default:
                // TODO use Pratt error type
                throw new Error("Invalid assignment target.");
        }
    }
    parseTernaryConditional (tokens, condition) {
        const start = tokens.previous().start;
        const thenExpr = this.parseExpression(tokens, 3);
        this.ensure(tokens, "symbol::");
        const elseExpr = this.parseExpression(tokens, 3);
        const end = elseExpr.end;

        return this.createNode("?", start, end, { condition, thenExpr, elseExpr });
    }
    parseCallExpression (tokens, left) {
        const start = tokens.previous().start;
        const args = [];

        while (!this.match(tokens, "symbol:)")) {
            args.push(this.parseExpression(tokens, 2));

            if (this.match(tokens, "symbol:,"))
                tokens.next();
            else if (this.match(tokens, "symbol:)"))
                break;
            else
                throw new RuntimeError("Expect ')' after arguments.");
        }

        this.ensure(tokens, "symbol:)");
        const end = tokens.previous().end;

        return this.createNode("call", start, end, { left, args });
    }
    parseSubscriptExpression (tokens, left) {
        const start = tokens.previous().start;
        const expression = this.parseExpression(tokens);

        this.ensure(tokens, "symbol:]");
        const end = tokens.previous().end;

        return this.createNode("computed", start, end, { left, expression });
    }
    parseMemberExpression (tokens, left) {
        const start = tokens.previous().start;
        if (!this.match(tokens, "identifier:")) {
            throw new RuntimeError("Expect property name after '.'.");
        }
        const name = this.ensure(tokens, "identifier:");
        const end = tokens.previous().end;

        return this.createNode("member", start, end, { left, name });
    }
    parseGroupingExpression (tokens) {
        const start = tokens.previous().start;
        let expression;

        if (!this.match(tokens, "symbol:)"))
            expression = this.parseExpression(tokens);
        else
            expression = this.parseBlank(tokens);

        this.ensure(tokens, "symbol:)");
        const end = tokens.previous().end;

        return this.createNode("grouping", start, end, expression);
    }
    parseIdentifier (tokens) {
        const token = tokens.previous();
        const { value, start, end } = token;
        const type = value === "this" ? "context" : "identifier"; 
        return this.createNode(type, start, end, {
            value
        });
    }
    parseSuperExpression (tokens) {
        const start = tokens.previous().start;
        if (!this.match(tokens, "symbol:."))
            throw new RuntimeError("Expect '.' after 'super'.");
        tokens.next();
        if (!this.match(tokens, "identifier:"))
            throw new RuntimeError("Expect superclass method name.");
        const name = this.ensure(tokens, "identifier:");
        const end = tokens.previous().end;

        return this.createNode("super", start, end, {
            name
        });
    }
}

class CallStack {
  constructor (parent) {
      this.parent = parent;
      this.value = null;
      this.complete = false;
  }
  return (value) {
      this.complete = true;
      this.value = value;
  }
}

class Context {
    constructor () {
        this.scope = [ new Map ]; // initialise with global scope
        this.global = this.scope[0];
        this.callStack = null;
        this.printMethod = null;
        this.variableMapping = null;
    }
    setGlobal (name, value) {
      if (this.global.has(name))
        throw new Error(`${name} is already defined on the global scope`);
      this.global.set(name, value);
    }
    setVariableMap (varMap) {
        this.variableMapping = varMap;
    }
    pushCall () {
        this.callStack = new CallStack(this.callStack);
    }
    popCall () {
        const value = this.callStack.value;
        this.callStack = this.callStack.parent;
        return value;
    }
    swapScope (temp) {
        const old = this.scope;
        this.scope = temp;
        return old;
    }
    copyScope () {
        return this.scope.slice(0);
    }
    print (str) {
        if (this.printMethod)
           this.printMethod(str);
    }
    callFunction (fn, args, walkStmt) {
       return fn.call(args, this, walkStmt);      
    }
    return (value) {
        if (this.callStack === null)
            throw new Error("Invalid return statement");
        else
            this.callStack.return(value);
    }
    shouldReturn () {
        return this.callStack !== null && this.callStack.complete;
    }
    resolve (expr, offset = 0) {
        const distance = this.variableMapping.get(expr);
        if (distance != null)
            return this.scope[distance + offset];
        else
            return this.global;
    }
    set (name, expr, value) {
        this.resolve(expr).set(name, value);
    }
    get (name, expr) {
        return this.resolve(expr).get(name);
    }
    push () {
        this.scope.unshift(new Map);
    }
    pop () {
        this.scope.shift();
    }
}

class NativeFunction extends LoxFunction {
  constructor (parameters, method) {
      super("", parameters, null, null);
      this.method = method;
  }
  toString () {
    return "<native fn>";
  }
  call (args, _ctx, _walkStmt) {
      return this.method(args);
  }
}

class ResolverContext {
  constructor (globals) {
    this.stack = [];
    this.globals = new Map;
    this.lookup = new WeakMap;
    
    this.classType = null;
    this.functionType = null;

    for (const name of globals)
      this.globals.set(name, true);
  }
  push () {
    this.stack.unshift(new Map);
  }
  pop () {
    this.stack.shift();
  }
  peek () {
    return this.stack[0];
  }
  declare (name) {
    const m = this.peek();
    if (m) {
      if (m.has(name))
        throw new RuntimeError("Variable with this name already declared in this scope.");
      m.set(name, false);
    }
    else
      this.globals.set(name, false);
  }
  define (name) {
    const m = this.peek();
    if (m) m.set(name, true);
    else this.globals.set(name, true);
  }
  resolveLocal (expr, name) {
    let i = 0;
    for (const m of this.stack) {
      if (m.has(name)) {
        if (m.get(name) === false)
          throw new RuntimeError("Cannot read local variable in its own initializer.");
        this.lookup.set(expr, i);
        return;
      }
      i++;
    }
    if (!this.globals.has(name))
      RuntimeError.undefined(name);
  }
}

class LoxResolver extends Walker {
    constructor () {
        super();

        const noop = (_a, _b) => {};
        
        this.defineStatement("module",  this.walkModule);
        this.defineStatement("function", this.walkFunction);
        this.defineStatement("class", this.walkClass);
        this.defineStatement("variable", this.walkVariable);
        this.defineStatement("expression", this.walkExpression);
        this.defineStatement("return",this.walkReturn);
        this.defineStatement("print", this.walkPrint);
        this.defineStatement("if", this.walkIf);
        this.defineStatement("while", this.walkWhile);
        this.defineStatement("for", this.walkFor);
        this.defineStatement("block", this.walkBlock);
        this.defineStatement("blank", noop);

        this.defineExpression(",",  this.walkBinaryExpression);
        this.defineExpression("?",  this.walkConditionalExpression);
        this.defineExpression("or",  this.walkBinaryExpression);
        this.defineExpression("and",  this.walkBinaryExpression);
        this.defineExpression("==",  this.walkBinaryExpression);
        this.defineExpression("!=",  this.walkBinaryExpression);
        this.defineExpression("<",  this.walkBinaryExpression);
        this.defineExpression(">",  this.walkBinaryExpression);
        this.defineExpression("<=",  this.walkBinaryExpression);
        this.defineExpression(">=",  this.walkBinaryExpression);
        this.defineExpression("+",  this.walkBinaryExpression);
        this.defineExpression("-",  this.walkBinaryExpression);
        this.defineExpression("*",  this.walkBinaryExpression);
        this.defineExpression("/",  this.walkBinaryExpression);

        this.defineExpression("!", this.walkUnaryExpression);
        this.defineExpression("minus", this.walkUnaryExpression);

        this.defineExpression("grouping", (expr, ctx) => this.walkExpression(expr, ctx));
        this.defineExpression("number", noop);
        this.defineExpression("string", noop);
        this.defineExpression("boolean", noop);
        this.defineExpression("member", this.walkMemberExpression);
        this.defineExpression("computed", this.walkComputedExpression);
        this.defineExpression("set", this.walkSetExpression);
        this.defineExpression("computed-set", this.walkComputedSetExpression);
        this.defineExpression("assignment", this.walkAssignmentExpression);
        this.defineExpression("call", this.walkCallExpression);
        this.defineExpression("identifier", (expr, ctx) => ctx.resolveLocal(expr, expr.value));
        this.defineExpression("context", this.walkContextExpression);
        this.defineExpression("super", this.walkSuperExpression);
        this.defineExpression("blank", noop);
    }
    walk (stmt, globals) {
        const ctx = new ResolverContext(globals);
        super.walk(stmt, ctx);
        return ctx.lookup;
    }
    walkModule (stmts, ctx) {
        this.hoistCallablesInBlock(stmts, ctx);
        for (const stmt of stmts) {
            this.walkStatement(stmt, ctx);
        }
    }
    hoistCallablesInBlock (stmts, ctx) {
        for (const stmt of stmts) {
            const { type, data } = stmt;
            if (type === "class" || type === "function")
                this.hoistCallable(data, ctx);
        }
    }
    hoistCallable (stmt, ctx) {
        const name = stmt.name;
        ctx.declare(name);
        ctx.define(name);
        ctx.resolveLocal(stmt, name);
    }
    walkFunction (stmt, ctx) {
        const { parameters, block } = stmt;
        ctx.push();

        const oldFnType = ctx.functionType;
        ctx.functionType = "function";

        if (parameters.length > 8)
            throw new Error("Cannot have more than 8 parameters.");

        for (const param of parameters) {
            ctx.declare(param);
            ctx.define(param);
        }
        this.walkFunctionBody(block, ctx);

        ctx.functionType = oldFnType;
        ctx.pop();
    }
    walkFunctionBody (stmt, ctx) {
        const { type, data } = stmt;
        if (type !== "block")
            throw new RuntimeError("Invalid function body");
        
        this.hoistCallablesInBlock(data, ctx);
        for (const sub of data) {
            this.walkStatement(sub, ctx);
        }
    }
    walkClass (stmt, ctx) {
        const { superClass, methods } = stmt;

        const oldClassType = ctx.classType;

        if (superClass) {
            ctx.resolveLocal(superClass, superClass.name);
            ctx.classType = "super";
            ctx.push();
            ctx.declare("super");
            ctx.define("super");
        }
        else {
            ctx.classType = "class";
        }

        for (const method of methods) {
            const { parameters, block } = method;
            ctx.push();

            ctx.declare("this");
            ctx.define("this");

            const fnType = method.name === "init" ? "init" : "method";
            const oldFnType = ctx.functionType;
            ctx.functionType = fnType;

            if (parameters.length > 8)
                throw new Error("Cannot have more than 8 parameters.");

            for (const param of parameters) {
                ctx.declare(param);
                ctx.define(param);
            }
            this.walkFunctionBody(block, ctx);

            ctx.functionType = oldFnType;
            ctx.pop();
        }

        if (superClass)
            ctx.pop();
            
        ctx.classType = oldClassType;
    }
    walkVariable (stmt, ctx) {
        const { initialiser, name } = stmt;
        ctx.declare(name);
        this.walkExpression(initialiser, ctx);
        ctx.define(name);
        ctx.resolveLocal(stmt, name);
    }
    walkReturn (stmt, ctx) {
        if (ctx.functionType === "init") {
            if (stmt.type !== "blank")
                throw new RuntimeError("Cannot return a value from an initializer.");
        }
        if (ctx.functionType === null)
            throw new RuntimeError("Cannot return from top-level code.");
            
        this.walkExpression(stmt, ctx);
    }
    walkPrint (stmt, ctx) {
        this.walkExpression(stmt, ctx);
    }
    walkIf (stmt, ctx) {
        const { condition, thenStatement, elseStatement } = stmt;
        this.walkExpression(condition, ctx);
        this.walkStatement(thenStatement, ctx);
        this.walkStatement(elseStatement, ctx);
    }
    walkWhile (stmt, ctx) {
        const { condition, thenStatement } = stmt;
        ctx.push();
        this.walkExpression(condition, ctx);
        ctx.push();
        this.walkStatement(thenStatement, ctx);
        ctx.pop();
        ctx.pop();
    }
    walkFor (stmt, ctx) {
        const { setup, condition, step, thenStatement } = stmt;

        ctx.push();
        this.walkStatement(setup, ctx);
        this.walkStatement(condition, ctx);
        ctx.push();
        this.walkStatement(thenStatement, ctx);
        ctx.pop();
        this.walkStatement(step, ctx);
        ctx.pop();
    }
    walkBlock (stmt, ctx) {
        ctx.push();
        this.hoistCallablesInBlock(stmt, ctx);
        for (const sub of stmt) {
            this.walkStatement(sub, ctx);
        }
        ctx.pop();
    }
    walkBinaryExpression (expr, ctx) {
        const { left, right } = expr;

        this.walkExpression(left, ctx);
        this.walkExpression(right, ctx);
    }
    walkUnaryExpression (expr, ctx) {
        this.walkExpression(expr, ctx);
    }
    walkMemberExpression (expr, ctx) {
        const { left } = expr;
        this.walkExpression(left, ctx);
    }
    walkComputedExpression (expr, ctx) {
        const { left, expression } = expr;
        
        this.walkExpression(left, ctx);
        this.walkExpression(expression, ctx);
    }
    walkSetExpression (expr, ctx) {
        const { left, right } = expr;
        this.walkExpression(left, ctx);
        this.walkExpression(right, ctx);
    }
    walkComputedSetExpression (expr, ctx) {
        const { left, right, expression } = expr;
        
        this.walkExpression(left, ctx);
        this.walkExpression(expression, ctx);
        this.walkExpression(right, ctx);
    }
    walkAssignmentExpression (expr, ctx) {
        const { name, right } = expr;
        this.walkExpression(right, ctx);

        ctx.resolveLocal(expr, name);
    }
    walkConditionalExpression (expr, ctx) {
        const { condition, thenExpr, elseExpr } = expr;
        this.walkExpression(condition, ctx);
        this.walkExpression(thenExpr, ctx);
        this.walkExpression(elseExpr, ctx);
    }
    walkCallExpression (expr, ctx) {
        const { left, args } = expr;
        this.walkExpression(left, ctx);

        if (args.length > 255)
            throw new Error("Cannot have more than 255 arguments.");

        args.map(arg => this.walkExpression(arg, ctx));
    }
    walkContextExpression (expr, ctx) {
        if (ctx.classType === null)
            throw new RuntimeError("Cannot use 'this' outside of a class.");
        ctx.resolveLocal(expr, expr.value);
    }
    walkSuperExpression (expr, ctx) {
        if (ctx.classType === null)
            throw new RuntimeError("Cannot use 'super' outside of a class.");
        else if (ctx.classType === "class")
            throw new RuntimeError("Cannot use 'super' in a class with no superclass.");
        ctx.resolveLocal(expr, "super");
    }
}

function addStandard (ctx) {
  defineFunction(ctx, "clock", [], () => Date.now());
  ctx.setGlobal("nil", null);
}

function createIsolate (stdout) {
  const ctx = new Context;
  const parser = new LoxParser;
  const resolver = new LoxResolver;
  const interpreter = new LoxInterpreter;

  addStandard(ctx);
  ctx.printMethod = stdout;
  

  return function (str) {
    const ast = parser.parseProgram(str);
    const varMap = resolver.walk(ast, ctx.global.keys());
    ctx.setVariableMap(varMap);
    interpreter.walk(ast, ctx);
  };
}

function defineFunction (ctx, name, parameters, fn) {
  const loxFunction = new NativeFunction(parameters, fn);
  ctx.setGlobal(name, loxFunction);
}

module.exports = createIsolate;
