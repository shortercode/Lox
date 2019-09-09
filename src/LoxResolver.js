import { Walker } from "../lib/Pratt.js";
import ResolverContext from "./ResolverContext.js";

export default class LoxResolver extends Walker {
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
        this.defineExpression("context", (expr, ctx) => ctx.resolveLocal(expr, expr.value));
        this.defineExpression("super", this.walkSuperExpression);
        this.defineExpression("blank", noop);
    }
    walk (stmt, globals) {
        const ctx = new ResolverContext(globals);
        super.walk(stmt, ctx);
        return ctx.lookup;
    }
    walkModule (stmts, ctx) {
        for (const stmt of stmts) {
            this.walkStatement(stmt, ctx);
        }
    }
    walkFunction (stmt, ctx) {
        const { parameters, block, name } = stmt;
        ctx.declare(name);
        ctx.define(name);
        ctx.push();
        for (const param of parameters) {
            ctx.declare(param);
            ctx.define(param);
        }
        this.walkStatement(block, ctx);
        ctx.pop();
        ctx.resolveLocal(stmt, name);
    }
    walkClass (stmt, ctx) {
        const { name, superClass, methods } = stmt;
        ctx.declare(name);
        ctx.define(name);
        ctx.push();
        ctx.declare("this");
        ctx.define("this");

        if (superClass) {
            ctx.resolveLocal(superClass, superClass.name);
        }
        for (const method of methods) {
            const { parameters, block } = method;
            ctx.push();
            for (const param of parameters) {
                ctx.declare(param);
                ctx.define(param);
            }
            this.walkStatement(block, ctx);
            ctx.pop();
        }
        ctx.pop();

        ctx.resolveLocal(stmt, name);
    }
    walkVariable (stmt, ctx) {
        const { initialiser, name } = stmt;
        ctx.declare(name);
        this.walkExpression(initialiser, ctx);
        ctx.define(name);
        ctx.resolveLocal(stmt, name);
    }
    walkReturn (stmt, ctx) {
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
        this.walkStatement(condition, ctx)
        ctx.push();
        this.walkStatement(thenStatement, ctx);
        ctx.pop();
        this.walkStatement(step, ctx);
        ctx.pop();
    }
    walkBlock (stmt, ctx) {
        ctx.push();
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
    walkCallExpression (expr, ctx) {
        const { left, args } = expr;
        this.walkExpression(left, ctx);

        args.map(arg => this.walkExpression(arg, ctx));
    }
    walkSuperExpression (expr, ctx) {
        
    }
}