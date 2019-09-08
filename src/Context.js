import CallStack from "./CallStack.js";
import Scope from "./Scope.js";
import RuntimeError from "./RuntimeError.js";

export default class Context {
  constructor () {
    this.scope = new Scope(null); // initialise with global scope
    this.callStack = null;
    this.printMethod = null;
  }
  define (name, value = null) {
    const scope = this.scope;
    if (scope.has(name))
      throw new Error(`${name} is already defined`);
    scope.set(name, value);
  }
  pushCall () {
    this.callStack = new CallStack(this.callStack);
  }
  popCall () {
    const value = this.callStack.value;
    this.callStack = this.callStack.parent;
    return value;
  }
  swapScope (temp) {
    const old = this.scope;
    this.scope = temp;
    return old;
  }
  print (str) {
    if (this.printMethod)
      this.printMethod(str);
  }
  callFunction (fn, args, walkStmt) {
    return fn.call(args, this, walkStmt);      
  }
  return (value) {
    if (this.callStack === null)
      throw new Error("Invalid return statement");
    else
      this.callStack.return(value);
  }
  shouldReturn () {
      return this.callStack !== null && this.callStack.complete;
  }
  resolve (name) {
    let scope = this.scope;
    while (scope !== null) {
    if (scope.has(name))
      return scope;
    scope = scope.parent;
    }
    return null;
  }
  set (name, value) {
    const scope = this.resolve(name);
    if (!scope)
      RuntimeError.undefined(name);
    scope.set(name, value);
  }
  get (name) {
    const scope = this.resolve(name);
    if (!scope)
      RuntimeError.undefined(name);
    return scope.get(name);
  }
  push () {
    this.scope = new Scope(this.scope);
  }
  pop () {
    this.scope = this.scope.parent;
  }
}