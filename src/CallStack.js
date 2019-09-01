export default class CallStack {
  constructor (parent) {
      this.parent = parent;
      this.value = null;
      this.complete = false;
  }
  return (value) {
      this.complete = true;
      this.value = value;
  }
}