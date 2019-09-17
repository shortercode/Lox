import LoxFunction from "./Function.js";

export default class NativeFunction extends LoxFunction {
  constructor (parameters, method) {
      super("", parameters, null, null);
      this.method = method;
  }
  toString () {
    return "<native fn>";
  }
  call (args, _ctx, _walkStmt) {
      return this.method(args);
  }
}