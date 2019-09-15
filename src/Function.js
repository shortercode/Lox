import RuntimeError from "./RuntimeError.js";

class Function {
  constructor (parameters, block, scope) {
      this.parameters = parameters;
      this.block = block;
      this.scope = scope;
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
  isBound () {
    return true;
  }
}

class BoundInitialiserFunction extends BoundFunction {
  call (args, ctx, walkStmt) {
    const returnValue = super.call(args, ctx, walkStmt);
    const inst = this.scope[0].get("this");

    if (returnValue != null)
      throw new RuntimeError("Cannot return a value from an initializer.");
    return inst; 
  }
}

export default Function;