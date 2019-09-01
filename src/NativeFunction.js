import Function from "./Function.js";

export default class NativeFunction extends Function {
  constructor (parameters, method) {
      super(parameters, null, null);
      this.method = method;
  }
  call (args, ctx, walkStmt) {
      this.method(args);
  }
}