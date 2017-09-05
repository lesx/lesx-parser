"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _types;

function _load_types() {
  return _types = require("../tokenizer/types");
}

var _tokenizer;

function _load_tokenizer() {
  return _tokenizer = _interopRequireDefault(require("../tokenizer"));
}

var _whitespace;

function _load_whitespace() {
  return _whitespace = require("../util/whitespace");
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// ## Parser utilities

class UtilParser extends (_tokenizer || _load_tokenizer()).default {
  // TODO

  addExtra(node, key, val) {
    if (!node) return;

    const extra = node.extra = node.extra || {};
    extra[key] = val;
  }

  // TODO

  isRelational(op) {
    return this.match((_types || _load_types()).types.relational) && this.state.value === op;
  }

  // TODO

  expectRelational(op) {
    if (this.isRelational(op)) {
      this.next();
    } else {
      this.unexpected(null, (_types || _load_types()).types.relational);
    }
  }

  // eat() for relational operators.

  eatRelational(op) {
    if (this.isRelational(op)) {
      this.next();
      return true;
    }
    return false;
  }

  // Tests whether parsed token is a contextual keyword.

  isContextual(name) {
    return this.match((_types || _load_types()).types.name) && this.state.value === name;
  }

  // Consumes contextual keyword if possible.

  eatContextual(name) {
    return this.state.value === name && this.eat((_types || _load_types()).types.name);
  }

  // Asserts that following token is given contextual keyword.

  expectContextual(name, message) {
    if (!this.eatContextual(name)) this.unexpected(null, message);
  }

  // Test whether a semicolon can be inserted at the current position.

  canInsertSemicolon() {
    return this.match((_types || _load_types()).types.eof) || this.match((_types || _load_types()).types.braceR) || this.hasPrecedingLineBreak();
  }

  hasPrecedingLineBreak() {
    return (_whitespace || _load_whitespace()).lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start));
  }

  // TODO

  isLineTerminator() {
    return this.eat((_types || _load_types()).types.semi) || this.canInsertSemicolon();
  }

  // Consume a semicolon, or, failing that, see if we are allowed to
  // pretend that there is a semicolon at this position.

  semicolon() {
    if (!this.isLineTerminator()) this.unexpected(null, (_types || _load_types()).types.semi);
  }

  // Expect a token of a given type. If found, consume it, otherwise,
  // raise an unexpected token error at given pos.

  expect(type, pos) {
    this.eat(type) || this.unexpected(pos, type);
  }

  // Raise an unexpected token error. Can take the expected token type
  // instead of a message string.

  unexpected(pos, messageOrType = "Unexpected token") {
    if (typeof messageOrType !== "string") {
      messageOrType = `Unexpected token, expected ${messageOrType.label}`;
    }
    throw this.raise(pos != null ? pos : this.state.start, messageOrType);
  }

  expectPlugin(name) {
    if (!this.hasPlugin(name)) {
      throw this.raise(this.state.start, `This experimental syntax requires enabling the parser plugin: '${name}'`, [name]);
    }
  }

  expectOnePlugin(names) {
    if (!names.some(n => this.hasPlugin(n))) {
      throw this.raise(this.state.start, `This experimental syntax requires enabling one of the following parser plugin(s): '${names.join(", ")}'`, names);
    }
  }
}
exports.default = UtilParser;
module.exports = exports["default"];