import { Parser } from "../lib/Pratt.js";
import RuntimeError from "./RuntimeError.js";

export default class LoxParser extends Parser {
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
        this.addInfix("symbol:,",           1,  this.binary(","))
        // assignment
        this.addInfix("symbol:=",           2,  this.parseAssignentExpression);
        // logical or
        this.addInfix("identifier:or",      3,  this.binary("or"));
        // logical and
        this.addInfix("identifier:and",     4,  this.binary("and"));
        // equality
        this.addInfix("symbol:==",          5,  this.binary("=="));
        this.addInfix("symbol:!=",          5,  this.binary("!="));
        // comparison
        this.addInfix("symbol:<",           6,  this.binary("<"));
        this.addInfix("symbol:>",           6,  this.binary(">"));
        this.addInfix("symbol:<=",          6,  this.binary("<="));
        this.addInfix("symbol:>=",          6,  this.binary(">="));
        // add/sub
        this.addInfix("symbol:+",           7,  this.binary("+"));
        this.addInfix("symbol:-",           7,  this.binary("-"));
        // mult/div
        this.addInfix("symbol:/",           8,  this.binary("/"));
        this.addInfix("symbol:*",           8,  this.binary("*"));
        // unary not
        this.addPrefix("symbol:!",          9,  this.unary("!"));
        // unary minus
        this.addPrefix("symbol:-",          9,  this.unary("minus"));
        // call function
        this.addInfix("symbol:(",           10, this.parseCallExpression);
        // subscript ( computed member )
        this.addInfix("symbol:[",           10, this.parseSubscriptExpression)
        // member
        this.addInfix("symbol:.",           10, this.parseMemberExpression)
        // grouping
        this.addPrefix("symbol:(",          11, this.parseGroupingExpression)

        this.addPrefix("number:",           12, this.literal("number"));
        this.addPrefix("string:",           12, this.literal("string"));
        this.addPrefix("identifier:",       12, this.parseIdentifier);
        this.addPrefix("identifier:true",   12, this.literal("boolean"));
        this.addPrefix("identifier:false",  12, this.literal("boolean"));
        this.addPrefix("identifier:super",  12, this.parseSuperExpression);
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

        if (this.match(tokens, "symbol:<"))
        {
            tokens.next();
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
            expression = this.parseBlank(tokens);

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
    parseCallExpression (tokens, left) {
        const start = tokens.previous().start;
        const args = [];

        while (!this.match(tokens, "symbol:)")) {
            args.push(this.parseExpression(tokens, 2));

            if (this.match(tokens, "symbol:,"))
                tokens.next();

            else
                break;
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
        this.ensure(tokens, "symbol:.");
        const name = this.ensure(tokens, "identifier:");
        const end = tokens.previous().end;

        return this.createNode("super", start, end, name);
    }
}