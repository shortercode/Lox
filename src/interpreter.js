import Walker from "../../Walker.js";
import Function from "./Function.js";
import Class from "./Class.js";
import RuntimeError from "./RuntimeError.js";
import Instance from "./Instance.js";
import Scope from "./Scope.js";

const binary = new Map(Object.entries({
    ",": (a, b) => b,
    "==": (a, b) =>  a === b,
    "!=": (a, b) => a !== b,
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "/": (a, b) => a / b,
    "*": (a, b) => a * b,
    "<": (a, b) => a < b,
    ">": (a, b) => a > b,
    "<=": (a, b) => a <= b,
    ">=": (a, b) => a >= b
}));

const unary = new Map(Object.entries({
    "-": a => -a,
    "!": a => !isTruthy(a)
}));

function assert(test, str) {
    if (!test)
        throw new Error(str);
}

function isTruthy (value) {
    if (value === null) return false;           
    if (value === true) return true;
    return true;
}

export default new Walker((stmt, expr) => {
    stmt("function", (stmt, ctx, walkStmt, walkExpr) => {
        const { parameters, block, name } = stmt;
        const fn = new Function(parameters, block, ctx.scope);
        ctx.define(name, fn);
    });
    stmt("class", (stmt, ctx, walkStmt, walkExpr) => {
        const { name, superClass, methods } = stmt;
        const definitions = [];
        const parent = superClass ? ctx.get(superClass) : null;
        let scope = ctx.scope;

        // if we have a superClass then add a super reference to a wrapper scope
        if (superClass) {
            scope = new Scope(scope);
            scope.set("super", parent);
        }
        
        for (const method of methods) {
            const { parameters, name, block } = method;
            const fn = new Function(parameters, block, scope);
            definitions.push([ name, fn ]);
        }

        const ctor = new Class(name, parent, definitions);
        
        ctx.define(name, ctor);
    });
    stmt("variable", (stmt, ctx, walkStmt, walkExpr) => {
        const { initialiser, name } = stmt;
        const value = walkExpr(initialiser, ctx);
        ctx.define(name, value);
    });
    stmt("expression", (stmt, ctx, walkStmt, walkExpr) => {
        walkExpr(stmt, ctx);
    });
    stmt("return", (stmt, ctx, walkStmt, walkExpr) => {
        ctx.return(walkExpr(stmt, ctx));
    });
    stmt("print", (stmt, ctx, walkStmt, walkExpr) => {
        ctx.print(walkExpr(stmt, ctx));
    });
    stmt("if", (stmt, ctx, walkStmt, walkExpr) => {
        const { condition, thenStatement, elseStatement } = stmt;
        const test = walkExpr(condition, ctx);
        const result = test ? thenStatement : elseStatement;
        walkStmt(result, ctx);
    });
    stmt("while", (stmt, ctx, walkStmt, walkExpr) => {
        const { condition, thenStatement } = stmt;
        ctx.push();
        while (walkExpr(condition, ctx)) {
            ctx.push();
            walkStmt(thenStatement, ctx);
            ctx.pop();
            if (ctx.shouldReturn())
                break;
        }
        ctx.pop();
    });
    stmt("for", (stmt, ctx, walkStmt, walkExpr) => {
        const { setup, condition, step, thenStatement } = stmt;

        ctx.push();
        walkStmt(setup, ctx);

        while (walkExpr(condition, ctx)) {
            ctx.push();
            walkStmt(thenStatement, ctx);
            ctx.pop();
            if (ctx.shouldReturn())
                break;
            walkExpr(step, ctx);
        }
        ctx.pop();
    });
    stmt("block", (stmt, ctx, walkStmt, walkExpr) => {
        ctx.push();
        for (const sub of stmt) {
            walkStmt(sub, ctx);
            if (ctx.shouldReturn())
                break;
        }
        ctx.pop();
    });
    stmt("blank", (stmt, ctx, walkStmt, walkExpr) => {});

    expr("binary", (expr, ctx, walkStmt, walkExpr) => {
        const { operator, left, right } = expr;

        const a = walkExpr(left, ctx);
        // both "or" and "and" are shortcircuit style operators
        switch (operator) {
            case "or": {
                    if (isTruthy(a)) return true;
                    return walkExpr(right, ctx);
                }
            case "and": {
                    if (!isTruthy(a)) return false;
                    return walkExpr(right, ctx);
                }
        }

        const b = walkExpr(right, ctx);
        const method = binary.get(operator);

        assert(method, "Illegal operator");

        return method(a, b);
        
    });
    expr("unary", (expr, ctx, walkStmt, walkExpr) => {
        const { operator, expression } = expr;

        const a = walkExpr(expression, ctx);
        const method = unary.get(operator);

        assert(method, "Illegal operator");

        return method(a);
    });
    expr("grouping", (expr, ctx, walkStmt, walkExpr) => {
        return walkExpr(expr, ctx);
    });
    expr("number", (expr, ctx, walkStmt, walkExpr) => {
        return Number(expr);
    });
    expr("string", (expr, ctx, walkStmt, walkExpr) => {
        return String(expr);
    });
    expr("boolean", (expr, ctx, walkStmt, walkExpr) => {
        return expr === "true";
    });
    expr("member", (expr, ctx, walkStmt, walkExpr) => {
        const { left, name } = expr;
        const inst = walkExpr(left, ctx);

        assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        return inst.get(name);
    });
    expr("computed", (expr, ctx, walkStmt, walkExpr) => {
        const { left, expression } = expr;
        const name = walkExpr(expression, ctx);
        const inst = walkExpr(left, ctx);

        assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        return inst.get(name);
    });
    expr("set", (expr, ctx, walkStmt, walkExpr) => {
        const { left, right, name } = expr;
        const inst = walkExpr(left, ctx);

        assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        const value = walkExpr(right, ctx);
        return inst.set(name, value);
    });
    expr("computed-set", (expr, ctx, walkStmt, walkExpr) => {
        const { left, right, expression } = expr;
        const name = walkExpr(expression, ctx);
        const inst = walkExpr(left, ctx);

        assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        const value = walkExpr(right, ctx);
        return inst.set(name, value);
    });
    expr("assignment", (expr, ctx, walkStmt, walkExpr) => {
        const { name, right } = expr;
        const value = walkExpr(right, ctx);

        ctx.set(name, value);

        return value;
    });
    expr("call", (expr, ctx, walkStmt, walkExpr) => {
        const { left, args } = expr;
        const fn = walkExpr(left, ctx);

        const values = args.map(arg => walkExpr(arg, ctx));

        if (fn instanceof Function)
            return ctx.callFunction(fn, values, walkStmt);

        else if (fn instanceof Class) {
            const inst = new Instance(fn);
            const init = inst.get("init");
            
            if (init)
                ctx.callFunction(init, args, walkStmt);

            return inst;
        }

        else
            throw new RuntimeError(`${fn} is not a function`);
    });
    expr("identifier", (expr, ctx, walkStmt, walkExpr) => {
        return ctx.get(expr);
    });
    expr("context", (expr, ctx, walkStmt, walkExpr) => {
        return ctx.get(expr);
    });
})