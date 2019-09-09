import LoxInterpreter from "./LoxInterpreter";
import LoxParser from "./LoxParser";
import Context from "./Context.js";
import NativeFunction from "./NativeFunction.js";
import LoxResolver from "./LoxResolver.js";

function addStandard (ctx) {
  defineFunction(ctx, "clock", [], () => Date.now());
  ctx.setGlobal("nil", null);
}

function createIsolate (stdout) {
  const ctx = new Context;
  const parser = new LoxParser;
  const resolver = new LoxResolver;
  const interpreter = new LoxInterpreter;

  addStandard(ctx);
  ctx.printMethod = stdout;
  

  return function (str) {
    const ast = parser.parseProgram(str);
    const varMap = resolver.walk(ast, ctx.global.keys());
    ctx.setVariableMap(varMap);
    interpreter.walk(ast, ctx);
  };
}

function defineFunction (ctx, name, parameters, fn) {
  const loxFunction = new NativeFunction(parameters, fn);
  ctx.setGlobal(name, loxFunction);
}

module.exports = createIsolate;