import RuntimeError from "./RuntimeError";
import LoxFunction from "./Function.js";

export default class Instance {
  constructor (cls) {
    this.properties = new Map;
    this.class = cls;
  }
  get (name, allowUndefined = false) {
    let p;
    if (this.properties.has(name))
      p = this.properties.get(name);
    else
      p = this.class.get(name);

    if (p === undefined) {
      if (allowUndefined)
        return p;
      else
        throw new RuntimeError(`Undefined property '${name}'.`);
    } 

    if (p instanceof LoxFunction) {
      if (p.isBound())
        return p;
      if (name === "init")
        return p.bindInit(this);
      else
        return p.bind(this);
    }

    return p;
  }
  set (name, value) {
    this.properties.set(name, value);
  }
  toString () {
    return `${this.class.toString()} instance`
  }
}