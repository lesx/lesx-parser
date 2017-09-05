"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _types;

function _load_types() {
  return _types = _interopRequireWildcard(require("../types"));
}

var _location;

function _load_location() {
  return _location = require("../util/location");
}

var _context;

function _load_context() {
  return _context = require("./context");
}

var _types2;

function _load_types2() {
  return _types2 = require("./types");
}

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

class State {
  init(options, input) {
    this.strict = options.strictMode === false ? false : options.sourceType === "module";

    this.input = input;

    this.potentialArrowAt = -1;

    // eslint-disable-next-line max-len
    this.inMethod = this.inFunction = this.inGenerator = this.inAsync = this.inPropertyName = this.inType = this.inClassProperty = this.noAnonFunctionType = false;

    this.classLevel = 0;

    this.labels = [];

    this.decoratorStack = [[]];

    this.tokens = [];

    this.comments = [];

    this.trailingComments = [];
    this.leadingComments = [];
    this.commentStack = [];
    // $FlowIgnore
    this.commentPreviousNode = null;

    this.pos = this.lineStart = 0;
    this.curLine = options.startLine;

    this.type = (_types2 || _load_types2()).types.eof;
    this.value = null;
    this.start = this.end = this.pos;
    this.startLoc = this.endLoc = this.curPosition();

    // $FlowIgnore
    this.lastTokEndLoc = this.lastTokStartLoc = null;
    this.lastTokStart = this.lastTokEnd = this.pos;

    this.context = [(_context || _load_context()).types.braceStatement];
    this.exprAllowed = true;

    this.containsEsc = this.containsOctal = false;
    this.octalPosition = null;

    this.invalidTemplateEscapePosition = null;

    this.exportedIdentifiers = [];
  }

  // TODO


  // TODO


  // Used to signify the start of a potential arrow function


  // Flags to track whether we are in a function, a generator.


  // Check whether we are in a (nested) class or not.


  // Labels in scope.


  // Leading decorators. Last element of the stack represents the decorators in current context.
  // Supports nesting of decorators, e.g. @foo(@bar class inner {}) class outer {}
  // where @foo belongs to the outer class and @bar to the inner


  // Token store.


  // Comment store.


  // Comment attachment store


  // The current position of the tokenizer in the input.


  // Properties of the current token:
  // Its type


  // For tokens that include more information than their type, the value


  // Its start and end offset


  // And, if locations are used, the {line, column} object
  // corresponding to those offsets


  // Position information for the previous token


  // The context stack is used to superficially track syntactic
  // context to predict whether a regular expression is allowed in a
  // given position.


  // Used to signal to callers of `readWord1` whether the word
  // contained any escape sequences. This is needed because words with
  // escape sequences must not be interpreted as keywords.


  // TODO


  // Names of exports store. `default` is stored as a name for both
  // `export default foo;` and `export { foo as default };`.


  curPosition() {
    return new (_location || _load_location()).Position(this.curLine, this.pos - this.lineStart);
  }

  clone(skipArrays) {
    const state = new State();
    for (const key in this) {
      // $FlowIgnore
      let val = this[key];

      if ((!skipArrays || key === "context") && Array.isArray(val)) {
        val = val.slice();
      }

      // $FlowIgnore
      state[key] = val;
    }
    return state;
  }
}
exports.default = State;
module.exports = exports["default"];