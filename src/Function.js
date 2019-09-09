import RuntimeError from "./RuntimeError.js";

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

    const env = this.scope[0];

    for (let i = 0; i < a; i++) {
      const name = this.parameters[i];
      env.set(name, args[i]);
    }

    walkStmt(this.block, ctx);

    ctx.pop();
    ctx.swapScope(oldScope);

    return ctx.popCall();
  }
}

class BoundFunction extends Function {
  constructor (fn, inst) {
      const scope = fn.scope.slice(0);
      scope.unshift(new Map([["this", inst]]));
      super(fn.parameters, fn.block, scope);
  }
}

export default Function;