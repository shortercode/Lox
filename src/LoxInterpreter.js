import { Walker } from "../lib/Pratt.js";
import LoxFunction from "./Function.js";
import Class from "./Class.js";
import RuntimeError from "./RuntimeError.js";
import Instance from "./Instance.js";

const ensureNumber = a => {
    if (typeof a != "number")
        throw new RuntimeError("Operand must be a number.");
}
const ensureNumbers = (a, b) => {
    if (typeof a != "number" || typeof b != "number")
        throw new RuntimeError("Operands must be numbers.");
}

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

export default class LoxInterpreter extends Walker {
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