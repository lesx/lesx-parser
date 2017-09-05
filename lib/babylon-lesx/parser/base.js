"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _identifier;

function _load_identifier() {
  return _identifier = require("../util/identifier");
}

class BaseParser {

  // Initialized by Tokenizer

  // Properties set by constructor in index.js
  isReservedWord(word) {
    if (word === "await") {
      return this.inModule;
    } else {
      return (_identifier || _load_identifier()).reservedWords[6](word);
    }
  }

  hasPlugin(name) {
    return !!this.plugins[name];
  }
}
exports.default = BaseParser;
module.exports = exports["default"];