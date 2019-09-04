DIST=./dist/
SRC=./src/*
 
all:
	make clean
	make core

core:
	rollup -i ${SRC}index.js -o ${DIST}Lox.js -f es

clean:
	rm -f $(DIST)*