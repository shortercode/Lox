export default class Scope extends Map {
  constructor (parent) {
      super();
      this.parent = parent;
  }
}