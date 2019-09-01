import RuntimeError from "./RuntimeError";
import Function from "./Function.js";

export default class Instance {
  constructor (cls) {
    this.properties = new Map;
    this.class = cls;
  }
  get (name) {
    let p = this.properties.get(name);

    if (typeof p === "undefined")
      p = this.class.get(name);

    if (typeof p === "undefined")
      throw new RuntimeError(`property "${name}" is undefined`);

    return p instanceof Function ? p.bind(this) : p;
  }
  set (name, value) {
    this.properties.set(name, value);
  }
}