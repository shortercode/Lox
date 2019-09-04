import { Parser } from "../lib/Pratt.js";

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
        this.addPrefix("symbol:-",          9,  this.unary("-"));
        // call function
        this.addInfix("symbol:(",           10, this.parseCallExpression);
        // subscript ( computed member )
        this.addInfix("symbol:[",           10, this.parseSubscriptExpression)
        // member
        this.addInfix("symbol:.",           10, this.parseMemberExpression)
        // grouping
        this.addPrefix("symbol:(",          11, this.parseMemberExpression)

        this.addPrefix("number:",           12, this.literal("number"));
        this.addPrefix("string:",           12, this.literal("string"));
        this.addPrefix("identifier:",       12, this.literal("identifier"));
        this.addPrefix("identifier:true",   12, this.literal("boolean"));
        this.addPrefix("identifier:false",  12, this.literal("boolean"));
        this.addPrefix("identifier:this",   12, this.literal("context"));
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
            else
                break;
        }

        this.ensure(tokens, "symbol:)");

        const block = this.parseBlock(tokens, parseStmt);

        return this.createNode("function", start, null, { name, parameters, block });
    }
    parseClassStmt (tokens) {
        const start = tokens.previous().start;
        const name = this.ensure(tokens, "identifier:");
        const methods = [];
        let superClass = null;

        if (this.match(tokens, "symbol:<"))
        {
            tokens.next();
            superClass = this.ensure(tokens, "identifier:");
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
                        else
                            break;
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

        return this.createNode("class", start, null, { name, superClass, methods });
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
    
        return this.createNode("variable", start, null, { name, initialiser });
    }
    parseReturnStmt (tokens) {
        const start = tokens.previous().start;
        let expression;
        if (!this.shouldEndStatement(tokens))
            expression = this.parseExpression(tokens);
        else
            expression = this.parseBlank(tokens);

        this.endStatement(tokens);

        return this.createNode("return", start, null, expression);
    }
    parsePrintStmt (tokens) {
        const start = tokens.previous().start;
        let expression;

        if (!this.shouldEndStatement(tokens))
            expression = this.parseExpression(tokens);
        else
            expression = this.parseBlank(tokens);

        this.endStatement(tokens);

        return this.createNode("print", start, null, expression);
    }
    parseIfStmt (tokens) {
        const start = tokens.previous().start;
        // parse condition

        this.ensure(tokens, "symbol:(");

        const condition = this.parseExpression(tokens);

        this.ensure(tokens, "symbol:)");

        // parse thenStatement

        const thenStatement = this.parseStatement(tokens);

        // check for elseStatement
        let elseStatement;

        if (this.match(tokens, "identifier:else")) {
            tokens.next();
            elseStatement = this.parseStatement(tokens);
        }
        else {
            elseStatement = this.parseBlank(tokens);
        }

        return this.createNode("if", start, null, {
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

        const thenStatement = this.parseStatement(tokens);

        return this.createNode("while", start, null, {
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

        if (this.match(tokens, "identifier:var" || this.match(tokens, "symbol:;"))) {
            setup = this.parseStatement(tokens); // either variable or blank
        }
        else {
            let expr = this.parseExpression(tokens);
            setup = this.createNode("expression", null, null, expr);
            this.endStatement(tokens);
        }


        if (this.match(tokens, "symbol:;")) {
            tokens.next();
            condition = this.parseBlank(tokens);
        }
        else {
            let expr = this.parseExpression(tokens);
            condition = this.createNode("expression", null, null, expr);
            this.endStatement(tokens);
        }

        if (this.match(tokens, "symbol:)")) {
            step = this.parseBlank(tokens);
        }
        else {
            let expr = this.parseExpression(tokens);
            step = this.createNode("expression", null, null, expr);
        }

        this.ensure(tokens, "symbol:)");

        const thenStatement = this.parseStatement(tokens);

        return this.createNode("for", start, null, {
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
        return this.createNode("blank", null, null, null);
    }
    parseBlock (tokens) {
        const start = tokens.previous().start;
        const statements = [];
        this.ensure(tokens, "symbol:{");
    
        while (!this.match(tokens, "symbol:}")) {
            statements.push(this.parseStatement(tokens));
        }
    
        this.ensure(tokens, "symbol:}");
    
        return this.createNode("block", start, null, statements);
    }
    parseAssignentExpression (tokens, left) {
        const start = tokens.previous().start;
        const right = this.parseExpression(tokens, 1);

        switch (left.type) {
            case "member":
                return this.createNode("set", start, null, {
                    left: left.data.left,
                    name: left.data.name,
                    right
                });
            case "computed":
                return this.createNode("computed-set", start, null, {
                    left: left.data.left,
                    expression: left.data.expression,
                    right
                });
            case "identifier":
                return this.createNode("assignment", start, null, {
                    name: left.data,
                    right
                });
            default:
                // TODO use Pratt error type
                throw new Error("Invalid assignment target");
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

        return this.createNode("call", start, null, { left, args });
    }
    parseSubscriptExpression (tokens, left) {
        const start = tokens.previous().start;
        const expression = this.parseExpression(tokens);

        this.ensure(tokens, "symbol:]");

        return this.createNode("computed", start, null, { left, expression });
    }
    parseMemberExpression (tokens, left) {
        const start = tokens.previous().start;
        const name = this.ensure(tokens, "identifier:");

        return this.createNode("member", start, null, { left, name });
    }
    parseGroupingExpression (tokens) {
        const start = tokens.previous().start;
        let expression;

        if (!this.match(tokens, "symbol:)"))
            expression = this.parseExpression(tokens);
        else
            expression = this.parseBlank(tokens);

        this.ensure(tokens, "symbol:)");

        return this.createNode("grouping", start, null, expression);
    }
}