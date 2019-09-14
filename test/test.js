"use strict";

let describe, it;

const PAUSE_ON = "./test/field/on_instance.lox";
{
  // state labels
  const READY = "ready", SET = "set", GO = "go"; 
  // internal state for the testing framework
  let currentGroup = [], state = READY, testCount = 0, passedCount = 0;
  
  // these methods apply styling to terminal output
  const green = str => `\x1b[32m${str}\x1b[0m`;
  const red = str => `\x1b[31m${str}\x1b[0m`;
  const bright = str => `\x1b[1m${str}\x1b[0m`;
   
  // this enables an overload of "describe" and "it" which accepts
  // only a function. the test/group will be named after the function
  function argumentAdaptor (name, fn) {
    if (typeof name === "function")
      return [name.name || "(anonymous)", name];
    else
       return [name, fn];
  }
  
  // "describe" defines a group using a function ( nestable )
  describe = (name, fn) => {
    if (state === READY)
      startSoon();
    
    const [ label, init ] = argumentAdaptor(name, fn);
    const group = [];
    const oldGroup = currentGroup;

    currentGroup = group;
    init();
    currentGroup = oldGroup;

    const callable = async depth => {
      console.log(`${"  ".repeat(depth)}${bright(label)}`);
      for (const fn of group) {
        await fn(depth + 1)
      }
    };
    
    oldGroup.push(callable);
  }
  
  // "it" describes a test using a function ( supports async/await )
  it = (name, fn) => {
    if (state === READY)
      startSoon();
    const [ label, test ] = argumentAdaptor(name, fn);
    currentGroup.push(async depth => {
      testCount++;
      try {
        await test();
        passedCount++;
        console.log(`${"  ".repeat(depth)}${green("✓")} ${label}`);
      }
    
      catch (e) {
        console.log(`${"  ".repeat(depth)}${red("✗")} ${label} ${red(e.message)}`);
      }
    });
  }

  async function run () {
    if (state != SET)
      throw new Error("Invalid state");
    state = GO;
    const start = Date.now();
    const tests = currentGroup.slice(0);
    testCount = 0;
    passedCount = 0;
    currentGroup.length = 0;
    for (const fn of tests)
      await fn(0);
    state = READY;
    console.log(`${passedCount} passing (${Date.now() - start}ms)`);
    const failed = testCount - passedCount;
    if (failed > 0)
      console.log(`${failed} failing`);
    if (currentGroup.length > 0)
      startSoon();
  }

  function startSoon () {
    if (state !== READY)
      throw new Error("Invalid state");
    setTimeout(run, 0);
    state = SET;
  }
}

const fs = require("fs");
const assert = require("assert");

const createLoxIsolate = require("../dist/Lox.js");

async function runTest (location) {
  const errTest = /\/\/ error at '[^']+'\: (.*)/i;
  const runtimeErrTest = /\/\/ expect runtime error\: (.*)/i;
  const expectTest = /\/\/ expect: (.*)/gi;
  const str = await fs.promises.readFile(location, "utf-8");
  
  const expectError = str.match(errTest) || str.match(runtimeErrTest);
  const expectResults = str.matchAll(expectTest);
  if (location === PAUSE_ON)
    debugger;
  try {
    const stdout = [];
    const isolate = createLoxIsolate(msg => stdout.push(msg));
    isolate(str);

    if (!expectError)
    {
      for (const expected of expectResults) {
        const result = stdout.shift();
        assert(result === expected[1], `Expected ${expected[1]} but recieved "${result}"`);
      }
    }
  }
  catch (e) {
    assert(expectError, e);
    assert(expectError[1] === e.message, `Expected error "${expectError[1]}" but recieved "${e.message}"`);
    return;
  }

  assert(expectError == null, `Expected error "${expectError && expectError[1]}"`);
}

function main () {
  describe(_ => {
    const location = "./test";
    const entries = fs.readdirSync(location);
    for (const entry of entries) {
      if (entry === "benchmark")
        continue;
      const entryLocation = location + "/" + entry;
      const info = fs.statSync(entryLocation);
      if (info.isDirectory()) {
        describe(entry, _ => {
          const entries = fs.readdirSync(entryLocation);
          for (const entry of entries) {
            it(entry, _ => runTest(entryLocation + "/" + entry));
          }
        });
      }
      else if (entry.endsWith(".lox")) {
        it(entry, _ => runTest(entryLocation));
      }
    }
  });
}

main();