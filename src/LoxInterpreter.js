import { Walker } from "../lib/Pratt.js";
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

export default class LoxInterpreter extends Walker {
    constructor () {
        super(); 
        
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
        this.defineExpression("binary", this.walkBinaryExpression);
        this.defineExpression("unary", this.walkUnaryExpression);
        this.defineExpression("grouping", (expr, ctx) => this.walkExpression(expr, ctx));
        this.defineExpression("number", (expr, ctx) => Number(expr));
        this.defineExpression("string", (expr, ctx) => String(expr));
        this.defineExpression("boolean", (expr, ctx) => expr === "true");
        this.defineExpression("member", this.walkMemberExpression);
        this.defineExpression("computed", this.walkComputedExpression);
        this.defineExpression("set", this.walkSetExpression);
        this.defineExpression("computed-set", this.walkComputedSetExpression);
        this.defineExpression("assignment", this.walkAssignmentExpression);
        this.defineExpression("call", this.walkCallExpression);
        this.defineExpression("identifier", (expr, ctx) => ctx.get(expr));
        this.defineExpression("context", (expr, ctx) => ctx.get(expr));
    }
    walkModule (stmts, ctx) {
        for (const stmt of stmts) {
            this.walkStatement(stmt, ctx);
        }
    }
    walkFunction (stmt, ctx) {
        const { parameters, block, name } = stmt;
        const fn = new Function(parameters, block, ctx.scope);
        ctx.define(name, fn);
    }
    walkClass (stmt, ctx) {
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
    }
    walkVariable (stmt, ctx) {
        const { initialiser, name } = stmt;
        const value = this.walkExpression(initialiser, ctx);
        ctx.define(name, value);
    }
    walkReturn (stmt, ctx) {
        ctx.return(this.walkExpression(stmt, ctx));
    }
    walkPrint (stmt, ctx) {
        ctx.print(this.walkExpression(stmt, ctx));
    }
    walkIf (stmt, ctx) {
        const { condition, thenStatement, elseStatement } = stmt;
        const test = this.walkExpression(condition, ctx);
        const result = test ? thenStatement : elseStatement;
        this.walkStatement(result, ctx);
    }
    walkWhile (stmt, ctx) {
        const { condition, thenStatement } = stmt;
        ctx.push();
        while (this.walkExpression(condition, ctx)) {
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

        while (this.walkExpression(condition, ctx)) {
            ctx.push();
            this.walkStatement(thenStatement, ctx);
            ctx.pop();
            if (ctx.shouldReturn())
                break;
            this.walkExpression(step, ctx);
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
    walkBinaryExpression (expr, ctx) {
        const { operator, left, right } = expr;

        const a = this.walkExpression(left, ctx);
        // both "or" and "and" are shortcircuit style operators
        switch (operator) {
            case "or": {
                    if (isTruthy(a)) return true;
                    return this.walkExpression(right, ctx);
                }
            case "and": {
                    if (!isTruthy(a)) return false;
                    return this.walkExpression(right, ctx);
                }
        }

        const b = this.walkExpression(right, ctx);
        const method = binary.get(operator);

        assert(method, "Illegal operator");

        return method(a, b);
    }
    walkUnaryExpression (expr, ctx) {
        const { operator, expression } = expr;

        const a = this.walkExpression(expression, ctx);
        const method = unary.get(operator);

        assert(method, "Illegal operator");

        return method(a);
    }
    walkMemberExpression (expr, ctx) {
        const { left, name } = expr;
        const inst = this.walkExpression(left, ctx);

        assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        return inst.get(name);
    }
    walkComputedExpression (expr, ctx) {
        const { left, expression } = expr;
        const name = this.walkExpression(expression, ctx);
        const inst = this.walkExpression(left, ctx);

        assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        return inst.get(name);
    }
    walkSetExpression (expr, ctx) {
        const { left, right, name } = expr;
        const inst = this.walkExpression(left, ctx);

        assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        const value = this.walkExpression(right, ctx);
        return inst.set(name, value);
    }
    walkComputedSetExpression (expr, ctx) {
        const { left, right, expression } = expr;
        const name = this.walkExpression(expression, ctx);
        const inst = this.walkExpression(left, ctx);

        assert(inst instanceof Instance, `cannot access property ${name} of non-object`);

        const value = this.walkExpression(right, ctx);
        return inst.set(name, value);
    }
    walkAssignmentExpression (expr, ctx) {
        const { name, right } = expr;
        const value = this.walkExpression(right, ctx);

        ctx.set(name, value);

        return value;
    }
    walkCallExpression (expr, ctx) {
        const { left, args } = expr;
        const fn = this.walkExpression(left, ctx);

        const values = args.map(arg => this.walkExpression(arg, ctx));

        if (fn instanceof Function)
            return ctx.callFunction(fn, values, walkStmt);

        else if (fn instanceof Class) {
            const inst = new Instance(fn);
            const init = inst.get("init");
            
            if (init)
                ctx.callFunction(init, args, this.walkStatement);

            return inst;
        }

        else
            throw new RuntimeError(`${fn} is not a function`);
    }
}