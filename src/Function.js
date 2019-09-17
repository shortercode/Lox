import RuntimeError from "./RuntimeError.js";

class LoxFunction {
  constructor (name, parameters, block, scope) {
      this.parameters = parameters;
      this.block = block;
      this.scope = scope;
      this.name = name;
  }
  toString () {
    return `<fn ${this.name}>`;
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

    if (this instanceof BoundFunction) {
      env.set("this", this.instance);
    }

    for (let i = 0; i < a; i++) {
      const name = this.parameters[i];
      env.set(name, args[i]);
    }

    for (const stmt of this.block.data) {
      walkStmt(stmt, ctx);
      if (ctx.shouldReturn())
          break;
    }

    ctx.pop();
    ctx.swapScope(oldScope);

    return ctx.popCall();
  }
}

class BoundFunction extends LoxFunction {
  constructor (fn, inst) {
      super(fn.name, fn.parameters, fn.block, fn.scope);
      this.instance = inst;
  }
  isBound () {
    return true;
  }
}

class BoundInitialiserFunction extends BoundFunction {
  call (args, ctx, walkStmt) {
    const returnValue = super.call(args, ctx, walkStmt);
    if (returnValue != null)
      throw new RuntimeError("Cannot return a value from an initializer.");
    return this.instance; 
  }
}

export default LoxFunction;