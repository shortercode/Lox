const fs = require("fs").promises;
const assert = require("assert");

const createLoxIsolate = require("../dist/Lox.js");

async function runTest (location) {
  const str = await fs.readFile(location, "utf-8");
  const stdout = [];
  const isolate = createLoxIsolate(msg => stdout.push(msg));
  isolate(str);
  return stdout;
}

function expect (value, expected) {
  assert(value === expected, `Expected: "${expected}"`);
}

async function expectFail (fn, expected) {
  try {
    await fn();
  }
  catch (e) {
    assert(e.message === expected, `Expected error message: "${expected}" recieved "${e.message}"`);
    return;
  }
  assert.fail(`Expected error message: "${expected}"`);
}

function main () {
  describe("assignment", function () {
    it("associativity", async function () {
      const stdout = await runTest("./test/assignment/associativity.lox");
      expect(stdout[0], "c");
      expect(stdout[1], "c");
      expect(stdout[2], "c"); 
    });
    it("global", async function () {
      const stdout = await runTest("./test/assignment/global.lox");
      expect(stdout[0], "before");
      expect(stdout[1], "after");
      expect(stdout[2], "arg"); 
      expect(stdout[2], "arg"); 
    });
    it("grouping", async function () {
      await expectFail(() => runTest("./test/assignment/grouping.lox"), "Invalid assignment target");
    });
    it("infix_operator", async function () {
      await expectFail(() => runTest("./test/assignment/infix_operator.lox"), "Invalid assignment target");
    });
    it("local", async function () {
      const stdout = await runTest("./test/assignment/local.lox");
      expect(stdout[0], "before");
      expect(stdout[1], "after");
      expect(stdout[2], "arg"); 
      expect(stdout[2], "arg"); 
    });
    it("infix_operator", async function () {
      await expectFail(() => runTest("./test/assignment/infix_operator.lox"), "Invalid assignment target");
    });
    it("syntax", async function () {
      const stdout = await runTest("./test/assignment/syntax.lox");
      expect(stdout[0], "var");
      expect(stdout[1], "var");
    });
    it("to_this", async function () {
      await expectFail(() => runTest("./test/assignment/to_this.lox"), "Invalid assignment target");
    });
    it("undefined", async function () {
      await expectFail(() => runTest("./test/assignment/undefined.lox"), "Undefined variable 'unknown'");
    });
  });
  describe("block", function () {
    it("empty", async function () {
      const stdout = await runTest("./test/block/empty.lox");
      expect(stdout[0], "ok");
    });
    it("scope", async function () {
      const stdout = await runTest("./test/block/scope.lox");
      expect(stdout[0], "inner");
      expect(stdout[1], "outer");
    });
  });
  describe("bool", function () {
    it("equality", async function () {
      const stdout = await runTest("./test/bool/equality.lox");
      expect(stdout[0], true);
      expect(stdout[1], false);
      expect(stdout[2], false);
      expect(stdout[3], true);

      // Not equal to other types.
      expect(stdout[4], false);
      expect(stdout[5], false);
      expect(stdout[6], false);
      expect(stdout[7], false);
      expect(stdout[8], false);

      expect(stdout[9], false);
      expect(stdout[10], true);
      expect(stdout[11], true);
      expect(stdout[12], false);

      // Not equal to other types.
      expect(stdout[13], true);
      expect(stdout[14], true);
      expect(stdout[15], true);
      expect(stdout[16], true);
      expect(stdout[17], true);
    });
    it("not", async function () {
      const stdout = await runTest("./test/bool/not.lox");
      expect(stdout[0], false);
      expect(stdout[1], true);
      expect(stdout[2], true);
    });
  });
  describe("call", function () {
    it("bool", async function () {
      await expectFail(() => runTest("./test/call/bool.lox"), "Can only call functions and classes");
    });
    it("nil", async function () {
      await expectFail(() => runTest("./test/call/nil.lox"), "Can only call functions and classes");
    });
    it("num", async function () {
      await expectFail(() => runTest("./test/call/num.lox"), "Can only call functions and classes");
    });
    it("object", async function () {
      await expectFail(() => runTest("./test/call/object.lox"), "Can only call functions and classes");
    });
    it("string", async function () {
      await expectFail(() => runTest("./test/call/string.lox"), "Can only call functions and classes");
    });
  });
  describe("class", function () {
    it("empty", async function () {
      const stdout = await runTest("./test/class/empty.lox");
      expect(stdout[0], "Foo");
    });
    it("inherit_self", async function () {
      await expectFail(() => runTest("./test/class/inherit_self.lox"), "A class cannot inherit from itself");
    });
    it("inherited_method", async function () {
      const stdout = await runTest("./test/class/inherited_method.lox");
      expect(stdout[0], "in foo");
      expect(stdout[1], "in bar");
      expect(stdout[2], "in baz");
    });
    it("local_inherit_other", async function () {
      const stdout = await runTest("./test/class/local_inherit_other.lox");
      expect(stdout[0], "B");
    });
    it("local_inherit_self", async function () {
      await expectFail(() => runTest("./test/class/local_inherit_self.lox"), "A class cannot inherit from itself");
    });
    it("local_reference_self", async function () {
      const stdout = await runTest("./test/class/local_reference_self.lox");
      expect(stdout[0], "Foo");
    });
    it("reference_self", async function () {
      const stdout = await runTest("./test/class/reference_self.lox");
      expect(stdout[0], "Foo");
    });
  });

  describe("closure", function () {
    it("assign_to_closure", async function () {
      const stdout = await runTest("./test/closure/assign_to_closure.lox");
      expect(stdout[0], "local");
      expect(stdout[1], "after f");
      expect(stdout[2], "after f");
      expect(stdout[3], "after g");
    });
    it("assign_to_shadowed_later", async function () {
      const stdout = await runTest("./test/closure/assign_to_shadowed_later.lox");
      expect(stdout[0], "inner");
      expect(stdout[1], "assigned");
    });
    it("close_over_function_parameter", async function () {
      const stdout = await runTest("./test/closure/close_over_function_parameter.lox");
      expect(stdout[0], "param");
    });
    it("close_over_later_variable", async function () {
      const stdout = await runTest("./test/closure/close_over_later_variable.lox");
      expect(stdout[0], "b");
      expect(stdout[1], "a");
    });
    it("close_over_method_parameter", async function () {
      const stdout = await runTest("./test/closure/close_over_method_parameter.lox");
      expect(stdout[0], "param");
    });
    it("closed_closure_in_function", async function () {
      const stdout = await runTest("./test/closure/closed_closure_in_function.lox");
      expect(stdout[0], "local");
    });
    it("nested_closure", async function () {
      const stdout = await runTest("./test/closure/nested_closure.lox");
      expect(stdout[0], "a");
      expect(stdout[1], "b");
      expect(stdout[2], "c");
    });
    it("open_closure_in_function", async function () {
      const stdout = await runTest("./test/closure/open_closure_in_function.lox");
      expect(stdout[0], "local");
    });
    it("reference_closure_multiple_times", async function () {
      const stdout = await runTest("./test/closure/reference_closure_multiple_times.lox");
      expect(stdout[0], "a");
      expect(stdout[1], "a");
    });
    it("reuse_closure_slot", async function () {
      const stdout = await runTest("./test/closure/reuse_closure_slot.lox");
      expect(stdout[0], "a");
    });
    it("shadow_closure_with_local", async function () {
      const stdout = await runTest("./test/closure/shadow_closure_with_local.lox");
      expect(stdout[0], "closure");
      expect(stdout[1], "shadow");
      expect(stdout[2], "closure");
    });

    it("unused_closure", async function () {
      const stdout = await runTest("./test/closure/unused_closure.lox");
      expect(stdout[0], "ok");
    });
    it("unused_later_closure", async function () {
      const stdout = await runTest("./test/closure/unused_later_closure.lox");
      expect(stdout[0], "a");
    });
  });

  describe("comments", function () {
    it("line_at_eof", async function () {
      const stdout = await runTest(`./test/comments/line_at_eof.lox`);
      expect(stdout[0], "ok");
    });
    it("only_line_comment_and_line", async function () {
      await runTest(`./test/comments/only_line_comment_and_line.lox`);
    });
    it("only_line_comment", async function () {
      await runTest(`./test/comments/only_line_comment_and_line.lox`);
    });
    it("unicode", async function () {
      const stdout = await runTest(`./test/comments/unicode.lox`);
      expect(stdout[0], "ok");
    });
  });

  describe("constructor", function () {
    it("arguments", async function () {
      const stdout = await runTest(`./test/constructor/arguments.lox`);
      expect(stdout[0], "init");
      expect(stdout[1], "1");
      expect(stdout[2], "2");
    });
  });

  return;
  
  describe("benchmark", function () {
    this.timeout(2e5);

    it("binary_trees", async function () {
      await runTest(`./test/benchmark/binary_trees.lox`);
    })
    it("equality", async function () {
      await runTest(`./test/benchmark/equality.lox`);
    })
    it("fib", async function () {
      await runTest(`./test/benchmark/fib.lox`);
    })
    it("invocation", async function () {
      await runTest(`./test/benchmark/invocation.lox`);
    })
    it("method_call", async function () {
      await runTest(`./test/benchmark/method_call.lox`);
    })
    it("properties", async function () {
      await runTest(`./test/benchmark/properties.lox`);
    })
    it("string_equality", async function () {
      await runTest(`./test/benchmark/string_equality.lox`);
    })
  });
}

main();