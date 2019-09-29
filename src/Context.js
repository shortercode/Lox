import CallStack from "./CallStack.js";

export default class Context {
    constructor () {
        this.scope = [ new Map ]; // initialise with global scope
        this.global = this.scope[0];
        this.callStack = null;
        this.printMethod = null;
        this.variableMapping = null;

        this.tailFunction = null;
        this.tailArguments = null;
    }
    setGlobal (name, value) {
      if (this.global.has(name))
        throw new Error(`${name} is already defined on the global scope`);
      this.global.set(name, value);
    }
    setVariableMap (varMap) {
        this.variableMapping = varMap;
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
    copyScope () {
        return this.scope.slice(0);
    }
    print (str) {
        if (this.printMethod)
           this.printMethod(str);
    }
    callFunction (fn, args, walkStmt) {
        let result = fn.call(args, this, walkStmt);
       
        while (this.tailFunction != null) {
            const fn = this.tailFunction;
            const args = this.tailArguments;
            this.tailArguments = null;
            this.tailFunction = null;

            result = fn.call(args, this, walkStmt);
        }
       
        return result;
    }
    return (value) {
        if (this.callStack === null)
            throw new Error("Invalid return statement");
        else
            this.callStack.return(value);
    }
    tailCall (fn, args) {
        if (this.tailFunction)
            throw new Error("A tail call is already pending, cannot register another");

        this.tailFunction = fn;
        this.tailArguments = args;
    }
    shouldReturn () {
        return this.callStack !== null && this.callStack.complete;
    }
    resolve (expr, offset = 0) {
        const distance = this.variableMapping.get(expr);
        if (distance != null)
            return this.scope[distance + offset];
        else
            return this.global;
    }
    set (name, expr, value) {
        this.resolve(expr).set(name, value);
    }
    get (name, expr) {
        return this.resolve(expr).get(name);
    }
    push () {
        this.scope.unshift(new Map);
    }
    pop () {
        this.scope.shift();
    }
}