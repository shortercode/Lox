# Lox*
An implementation of the Lox programming language written in modern JavaScript. Unlike most implementations this isn't based on the book "Crafting interpreters" by Bob Nystrum. Instead it is an independent implementation based on the Pratt parser design.

Behaviour wise it is intended to match the reference implementation. At the moment it is passing nearly the entire test suite, with only minor variance.

Going forward I intend to implement the following features that are suggested in the "challenges" section of the Crafting interpreters book:
- tail call optimisation
- static class methods
- function expressions

In addition I am considering the following extensions
- module system
- foreign interface
- collections
