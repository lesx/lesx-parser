"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.types = exports.TokContext = undefined;

var _types;

function _load_types() {
  return _types = require("./types");
}

var _whitespace;

function _load_whitespace() {
  return _whitespace = require("../util/whitespace");
}

// The algorithm used to determine whether a regexp can appear at a
// given point in the program is loosely based on sweet.js' approach.
// See https://github.com/mozilla/sweet.js/wiki/design

class TokContext {
  constructor(token, isExpr, preserveSpace, override) // Takes a Tokenizer as a this-parameter, and returns void.
  {
    this.token = token;
    this.isExpr = !!isExpr;
    this.preserveSpace = !!preserveSpace;
    this.override = override;
  }

}

exports.TokContext = TokContext;
const types = exports.types = {
  braceStatement: new TokContext("{", false),
  braceExpression: new TokContext("{", true),
  templateQuasi: new TokContext("${", true),
  parenStatement: new TokContext("(", false),
  parenExpression: new TokContext("(", true),
  template: new TokContext("`", true, true, p => p.readTmplToken()),
  functionExpression: new TokContext("function", true)
};

// Token-specific context update code

(_types || _load_types()).types.parenR.updateContext = (_types || _load_types()).types.braceR.updateContext = function () {
  if (this.state.context.length === 1) {
    this.state.exprAllowed = true;
    return;
  }

  const out = this.state.context.pop();
  if (out === types.braceStatement && this.curContext() === types.functionExpression) {
    this.state.context.pop();
    this.state.exprAllowed = false;
  } else if (out === types.templateQuasi) {
    this.state.exprAllowed = true;
  } else {
    this.state.exprAllowed = !out.isExpr;
  }
};

(_types || _load_types()).types.name.updateContext = function (prevType) {
  if (this.state.value === "of" && this.curContext() === types.parenStatement) {
    this.state.exprAllowed = !prevType.beforeExpr;
    return;
  }

  this.state.exprAllowed = false;

  if (prevType === (_types || _load_types()).types._let || prevType === (_types || _load_types()).types._const || prevType === (_types || _load_types()).types._var) {
    if ((_whitespace || _load_whitespace()).lineBreak.test(this.input.slice(this.state.end))) {
      this.state.exprAllowed = true;
    }
  }
};

(_types || _load_types()).types.braceL.updateContext = function (prevType) {
  this.state.context.push(this.braceIsBlock(prevType) ? types.braceStatement : types.braceExpression);
  this.state.exprAllowed = true;
};

(_types || _load_types()).types.dollarBraceL.updateContext = function () {
  this.state.context.push(types.templateQuasi);
  this.state.exprAllowed = true;
};

(_types || _load_types()).types.parenL.updateContext = function (prevType) {
  const statementParens = prevType === (_types || _load_types()).types._if || prevType === (_types || _load_types()).types._for || prevType === (_types || _load_types()).types._with || prevType === (_types || _load_types()).types._while;
  this.state.context.push(statementParens ? types.parenStatement : types.parenExpression);
  this.state.exprAllowed = true;
};

(_types || _load_types()).types.incDec.updateContext = function () {
  // tokExprAllowed stays unchanged
};

(_types || _load_types()).types._function.updateContext = function () {
  if (this.curContext() !== types.braceStatement) {
    this.state.context.push(types.functionExpression);
  }

  this.state.exprAllowed = false;
};

(_types || _load_types()).types.backQuote.updateContext = function () {
  if (this.curContext() === types.template) {
    this.state.context.pop();
  } else {
    this.state.context.push(types.template);
  }
  this.state.exprAllowed = false;
};