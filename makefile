DIST=./dist/
SRC=./src/*
 
all: clean dist tests

dist:
	rollup -i ${SRC}index.js -o ${DIST}Lox.js -f es
	touch ${DIST}Lox
	echo "#!/usr/bin/env node" >> ${DIST}Lox
	echo "const lox = require('./Lox.js');" >> ${DIST}Lox
	echo "const fs = require('fs');" >> ${DIST}Lox
	echo "const mod = process.argv[2]" >> ${DIST}Lox
	echo "const str = fs.readFileSync(mod, 'utf-8');" >> ${DIST}Lox
	echo "const isolate = lox(console.log, console.error);" >> ${DIST}Lox
	echo "isolate(str);" >> ${DIST}Lox
	chmod +x ${DIST}Lox


# Run the tests for the final versions of clox and jlox.
test:
	node tests/test_runner.js

clean:
	rm -rf $(DIST)