export default class Class {
  constructor (name, superClass, definitions, scope) {
      this.name = name;
      this.definitions = new Map(definitions);
      this.superClass = superClass;
  }
  get (name) {
    return this.definitions.get(name) || (this.superClass ? this.superClass.get(name) : null);
  }
  toString () {
    return this.name;
  }
}