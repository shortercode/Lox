import LoxInterpreter from "./LoxInterpreter";
import LoxParser from "./LoxParser";
import Context from "./Context.js";
import NativeFunction from "./NativeFunction.js";
function createIsolate (stdout) {
  const ctx = new Context;
  const parser = new LoxParser;
  const interpreter = new LoxInterpreter;

  ctx.printMethod = stdout;
  defineFunction(ctx, "clock", [], () => Date.now());
  ctx.define("nil", null);

  return function (str) {
    const ast = parser.parseProgram(str);
    interpreter.walk(ast, ctx);
  };
}

function defineFunction (ctx, name, parameters, fn) {
  const loxFunction = new NativeFunction(parameters, fn);
  ctx.define(name, loxFunction);
}

module.exports = createIsolate;