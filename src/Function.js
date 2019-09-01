import RuntimeError from "./RuntimeError.js";
import Scope from "./Scope.js";

class Function {
  constructor (parameters, block, scope) {
      this.parameters = parameters;
      this.block = block;
      this.scope = scope;
  }
  bind (inst) {
    return new BoundFunction(this, inst);
  }
  call (args, ctx, walkStmt) {
    const a = args.length;
    const b = this.parameters.length;

    if (a.length !== b.length)
      throw new RuntimeError(`Expected ${b} arguments but got ${a}`);

    const oldScope = ctx.swapScope(this.scope);
    
    ctx.pushCall();
    ctx.push();

    for (let i = 0; i < a; i++) {
      const name = this.parameters[i];
      ctx.define(name, args[i]);
    }

    walkStmt(this.block, ctx);

    ctx.pop();
    ctx.swapScope(oldScope);

    return ctx.popCall();
  }
}

class BoundFunction extends Function {
  constructor (fn, inst) {
      super(fn.parameters, fn.block, new Scope(fn.scope));
      this.scope.set("this", inst);
  }
}

export default Function;