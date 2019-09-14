
import RuntimeError from "./RuntimeError.js";

export default class ResolverContext {
  constructor (globals) {
    this.stack = [];
    this.globals = new Map;
    this.lookup = new WeakMap;

    this.functionType = null;

    for (const name of globals)
      this.globals.set(name, true);
  }
  push () {
    this.stack.unshift(new Map)
  }
  pop () {
    this.stack.shift()
  }
  peek () {
    return this.stack[0];
  }
  declare (name) {
    const m = this.peek();
    if (m) m.set(name, false);
    else this.globals.set(name, false);
  }
  define (name) {
    const m = this.peek();
    if (m) m.set(name, true);
    else this.globals.set(name, true);
  }
  resolveLocal (expr, name) {
    let i = 0;
    for (const m of this.stack) {
      if (m.has(name)) {
        this.lookup.set(expr, i);
        return;
      }
      i++;
    }
    if (!this.globals.has(name))
      RuntimeError.undefined(name);
  }
}