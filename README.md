# Lox*
An implementation of the Lox programming language written in modern JavaScript. Unlike most implementations this isn't based on the book "Crafting interpreters" by Bob Nystrum. Instead it is an independent implementation based on the Pratt parser design. Inspiration for this comes from the excellent article "[Pratt Parsers: Expression Parsing Made Easy](http://journal.stuffwithstuff.com/2011/03/19/pratt-parsers-expression-parsing-made-easy/)" which is also written by Bob Nystrum.

Behaviour wise it is intended to match the reference implementation. At the moment it is passing nearly the entire test suite, with only minor variance in some of the error messages.

In addition to the standard syntax of Lox I have also implemented the following suggested extensions:
- comma operator
- tail call optimisation
- ternary conditional operator
- function expressions

Intend to implement the following suggested extensions:
- static class methods

Considering a few additional extensions:
- module system
- foreign interface
- collections
