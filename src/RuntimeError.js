class RuntimeError extends Error {
  toString() {
    return `RuntimeError: ${this.message}`;
  }
  static undefined (name) {
    throw new RuntimeError(`Undefined variable '${name}'`)
  }
}
export default RuntimeError;