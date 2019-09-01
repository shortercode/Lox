import Parser from "../../Parser.js";
import Node from "../../Node.js";

function parseBlock (tokens, parseStmt) {
    const statements = [];
    Parser.ensure(tokens, "symbol:{");

    while (!Parser.match(tokens, "symbol:}")) {
        statements.push(parseStmt(tokens));
    }

    Parser.ensure(tokens, "symbol:}");

    return new Node("block", statements);
}

function blankStatement () {
    return new Node("blank");
}

function blankExpression () {
    return new Node("blank");
}

export default new Parser((stmt, prefix, infix) => {
    stmt("identifier:fun", (tokens, left, parseStmt, parseExpr) => {
        const name = Parser.ensure(tokens, "identifier:");
        const parameters = [];
        Parser.ensure(tokens, "symbol:(");

        while (!Parser.match(tokens, "symbol:)"))
        {
            const param = Parser.ensure(tokens, "identifier:");
            parameters.push(param);

            if (Parser.match(tokens, "symbol:,"))
                tokens.next();
            else
                break;
        }

        Parser.ensure(tokens, "symbol:)");

        const block = parseBlock(tokens, parseStmt);

        return new Node("function", { name, parameters, block });
    });
    stmt("identifier:class", (tokens, left, parseStmt, parseExpr) => {
        const name = Parser.ensure(tokens, "identifier:");
        const methods = [];
        let superClass = null;

        if (Parser.match(tokens, "symbol:<"))
        {
            tokens.next();
            superClass = Parser.ensure(tokens, "identifier:");
        }
        
        Parser.ensure(tokens, "symbol:{");

        if (!Parser.match(tokens, "symbol:}"))
        {
            while (true) {
                const name = Parser.ensure(tokens, "identifier:");
                const parameters = [];

                Parser.ensure(tokens, "symbol:(");

                if (!Parser.match(tokens, "symbol:)"))
                {
                    while (true) {
                        const param = Parser.ensure(tokens, "identifier:");
                        parameters.push(param);

                        if (Parser.match(tokens, "symbol:,"))
                            tokens.next();
                        else
                            break;
                    }
                }

                Parser.ensure(tokens, "symbol:)");

                const block = parseBlock(tokens, parseStmt);
                
                methods.push({ name, parameters, block });

                if (Parser.match(tokens, "symbol:}"))
                    break;
            }
        }

        Parser.ensure(tokens, "symbol:}");

        return new Node("class", { name, superClass, methods });
    });
    stmt("identifier:var", (tokens, left, parseStmt, parseExpr) => {
        const name = Parser.ensure(tokens, "identifier:");
        let initialiser = blankExpression();
    
        if (Parser.match(tokens, "symbol:=")) {
            tokens.next();
            initialiser = parseExpr(tokens);
        }
    
        Parser.endStatement(tokens);
    
        return new Node("variable", { name, initialiser });
    });
    stmt("identifier:return", (tokens, left, parseStmt, parseExpr) => {
        let expression = blankExpression();
        if (!Parser.shouldEndStatement(tokens))
            expression = parseExpr(tokens);

        Parser.endStatement(tokens);

        return new Node("return", expression);
    });
    stmt("identifier:print", (tokens, left, parseStmt, parseExpr) => {
        let expression = blankExpression();
        if (!Parser.shouldEndStatement(tokens))
            expression = parseExpr(tokens);

        Parser.endStatement(tokens);

        return new Node("print", expression);
    });
    stmt("identifier:if", (tokens, left, parseStmt, parseExpr) => {
        let elseStatement = blankStatement();

        // parse condition

        Parser.ensure(tokens, "symbol:(");

        const condition = parseExpr(tokens);

        Parser.ensure(tokens, "symbol:)");

        // parse thenStatement

        const thenStatement = parseStmt(tokens);

        // check for elseStatement

        if (Parser.match(tokens, "identifier:else")) {
            tokens.next();
            elseStatement = parseStmt(tokens);
        }

        return new Node("if", {
            condition,
            thenStatement,
            elseStatement
        });
    });
    stmt("identifier:while", (tokens, left, parseStmt, parseExpr) => {
        // parse condition

        Parser.ensure(tokens, "symbol:(");

        const condition = parseExpr(tokens);

        Parser.ensure(tokens, "symbol:)");

        // parse thenStatement

        const thenStatement = parseStmt(tokens);

        return new Node("while", {
            condition,
            thenStatement
        });
    });
    stmt("identifier:for", (tokens, left, parseStmt, parseExpr) => {
        Parser.ensure(tokens, "symbol:(");

        let setup = null;
        let condition = null;
        let step = null;

        if (Parser.match(tokens, "identifier:var" || Parser.match(tokens, "symbol:;"))) {
            setup = parseStmt(tokens); // either variable or blank
        }
        else {
            setup = new Node("expression", parseExpr(tokens));
            Parser.endStatement(tokens);
        }


        if (Parser.match(tokens, "symbol:;")) {
            tokens.next();
            condition = blankStatement();
        }
        else {
            condition = new Node("expression", parseExpr(tokens));
            Parser.endStatement(tokens);
        }

        if (Parser.match(tokens, "symbol:)")) {
            step = blankStatement();
        }
        else {
            step = new Node("expression", parseExpr(tokens));
        }

        Parser.ensure(tokens, "symbol:)");

        const thenStatement = parseStmt(tokens);

        return new Node("for", {
            setup,
            condition,
            step,
            thenStatement
        });
    });
    stmt("symbol:{", (tokens, left, parseStmt, parseExpr) => {
        tokens.back();
        return parseBlock(tokens, parseStmt);
    });
    stmt("symbol:;", (tokens, left, parseStmt, parseExpr) => blankStatement());

    // sequence
    infix("symbol:,", 1, Parser.binary);
    // assignment
    infix("symbol:=", 2, (tokens, left, parseStmt, parseExpr) => {
        const right = parseExpr(tokens, 1);

        switch (left.type) {
            case "member":
                return new Node("set", {
                    left: left.data.left,
                    name: left.data.name,
                    right
                });
            case "computed":
                return new Node("computed-set", {
                    left: left.data.left,
                    expression: left.data.expression,
                    right
                });
            case "identifier":
                return new Node("assignment", {
                    name: left.data,
                    right
                });
            default:
                throw new Error("Invalid assignment target");
        }
        
    });
    // logical or
    infix("identifier:or", 3, Parser.binary);
    // logical and
    infix("identifier:and", 4, Parser.binary);
    // equality
    infix("symbol:==", 5, Parser.binary);
    infix("symbol:!=", 5, Parser.binary);
    // comparison
    infix("symbol:<", 6, Parser.binary);
    infix("symbol:>", 6, Parser.binary);
    infix("symbol:<=", 6, Parser.binary);
    infix("symbol:>=", 6, Parser.binary);
    // add/sub
    infix("symbol:+", 7, Parser.binary);
    infix("symbol:-", 7, Parser.binary);
    // mult/div
    infix("symbol:/", 8, Parser.binary);
    infix("symbol:*", 8, Parser.binary);
    // unary not
    prefix("symbol:!", 9, Parser.unary);
    // unary minus
    prefix("symbol:-", 9, Parser.unary);
    // call function
    infix("symbol:(", 10, (tokens, left, parseStmt, parseExpr) => {
        const args = [];

        while (!Parser.match(tokens, "symbol:)")) {
            args.push(parseExpr(tokens, 2));

            if (Parser.match(tokens, "symbol:,"))
                tokens.next();

            else
                break;
        }

        Parser.ensure(tokens, "symbol:)");

        return new Node("call", { left, args });
    })

    infix("symbol:[", 10, (tokens, left, parseStmt, parseExpr) => {
        const expression = parseExpr(tokens);

        Parser.ensure(tokens, "symbol:]");

        return new Node("computed", { left, expression });
    })

    infix("symbol:.", 10, (tokens, left, parseStmt, parseExpr) => {
      const name = Parser.ensure(tokens, "identifier:");

      return new Node("member", { left, name });
    })

    prefix("symbol:(", 11, (tokens, left, parseStmt, parseExpr) => {
      let expression = blankExpression();

      if (!Parser.match(tokens, "symbol:)"))
        expression = parseExpr(tokens);

      Parser.ensure(tokens, "symbol:)");

      return new Node("grouping", expression);
    })

    prefix("number:", 12, Parser.number);
    prefix("string:", 12, Parser.string);
    prefix("identifier:", 12, Parser.identifier);
    prefix("identifier:true", 12, Parser.boolean);
    prefix("identifier:false", 12, Parser.boolean);
    prefix("identifier:this", 12, Parser.context);
});