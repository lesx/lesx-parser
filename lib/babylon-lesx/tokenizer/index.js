"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Token = undefined;

var _isNan;

function _load_isNan() {
  return _isNan = _interopRequireDefault(require("babel-runtime/core-js/number/is-nan"));
}

var _identifier;

function _load_identifier() {
  return _identifier = require("../util/identifier");
}

var _types;

function _load_types() {
  return _types = require("./types");
}

var _context;

function _load_context() {
  return _context = require("./context");
}

var _location;

function _load_location() {
  return _location = _interopRequireDefault(require("../parser/location"));
}

var _location2;

function _load_location2() {
  return _location2 = require("../util/location");
}

var _whitespace;

function _load_whitespace() {
  return _whitespace = require("../util/whitespace");
}

var _state;

function _load_state() {
  return _state = _interopRequireDefault(require("./state"));
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// The following character codes are forbidden from being
// an immediate sibling of NumericLiteralSeparator _

const forbiddenNumericSeparatorSiblings = {
  decBinOct: [46, // .
  66, // B
  69, // E
  79, // O
  95, // _ (multiple separators are not allowed)
  98, // b
  101, // e
  111],
  hex: [46, // .
  88, // X
  95, // _ (multiple separators are not allowed)
  120]
};

// Object type used to represent tokens. Note that normally, tokens
// simply exist as properties on the parser object. This is only
// used for the onToken callback and the external tokenizer.

/* eslint max-len: 0 */

class Token {
  constructor(state) {
    this.type = state.type;
    this.value = state.value;
    this.start = state.start;
    this.end = state.end;
    this.loc = new (_location2 || _load_location2()).SourceLocation(state.startLoc, state.endLoc);
  }

}

exports.Token = Token; // ## Tokenizer

function codePointToString(code) {
  // UTF-16 Decoding
  if (code <= 0xffff) {
    return String.fromCharCode(code);
  } else {
    return String.fromCharCode((code - 0x10000 >> 10) + 0xd800, (code - 0x10000 & 1023) + 0xdc00);
  }
}

class Tokenizer extends (_location || _load_location()).default {
  // Forward-declarations
  // parser/util.js
  constructor(options, input) {
    super();
    this.state = new (_state || _load_state()).default();
    this.state.init(options, input);
    this.isLookahead = false;
  }

  // Move to the next token

  next() {
    if (this.options.tokens && !this.isLookahead) {
      this.state.tokens.push(new Token(this.state));
    }

    this.state.lastTokEnd = this.state.end;
    this.state.lastTokStart = this.state.start;
    this.state.lastTokEndLoc = this.state.endLoc;
    this.state.lastTokStartLoc = this.state.startLoc;
    this.nextToken();
  }

  // TODO

  eat(type) {
    if (this.match(type)) {
      this.next();
      return true;
    } else {
      return false;
    }
  }

  // TODO

  match(type) {
    return this.state.type === type;
  }

  // TODO

  isKeyword(word) {
    return (0, (_identifier || _load_identifier()).isKeyword)(word);
  }

  // TODO

  lookahead() {
    const old = this.state;
    this.state = old.clone(true);

    this.isLookahead = true;
    this.next();
    this.isLookahead = false;

    const curr = this.state;
    this.state = old;
    return curr;
  }

  // Toggle strict mode. Re-reads the next number or string to please
  // pedantic tests (`"use strict"; 010;` should fail).

  setStrict(strict) {
    this.state.strict = strict;
    if (!this.match((_types || _load_types()).types.num) && !this.match((_types || _load_types()).types.string)) return;
    this.state.pos = this.state.start;
    while (this.state.pos < this.state.lineStart) {
      this.state.lineStart = this.input.lastIndexOf("\n", this.state.lineStart - 2) + 1;
      --this.state.curLine;
    }
    this.nextToken();
  }

  curContext() {
    return this.state.context[this.state.context.length - 1];
  }

  // Read a single token, updating the parser object's token-related
  // properties.

  nextToken() {
    const curContext = this.curContext();
    if (!curContext || !curContext.preserveSpace) this.skipSpace();

    this.state.containsOctal = false;
    this.state.octalPosition = null;
    this.state.start = this.state.pos;
    this.state.startLoc = this.state.curPosition();
    if (this.state.pos >= this.input.length) return this.finishToken((_types || _load_types()).types.eof);

    if (curContext.override) {
      return curContext.override(this);
    } else {
      return this.readToken(this.fullCharCodeAtPos());
    }
  }

  readToken(code) {
    // Identifier or keyword. '\uXXXX' sequences are allowed in
    // identifiers, so '\' also dispatches to that.
    if ((0, (_identifier || _load_identifier()).isIdentifierStart)(code) || code === 92 /* '\' */) {
        return this.readWord();
      } else {
      return this.getTokenFromCode(code);
    }
  }

  fullCharCodeAtPos() {
    const code = this.input.charCodeAt(this.state.pos);
    if (code <= 0xd7ff || code >= 0xe000) return code;

    const next = this.input.charCodeAt(this.state.pos + 1);
    return (code << 10) + next - 0x35fdc00;
  }

  pushComment(block, text, start, end, startLoc, endLoc) {
    const comment = {
      type: block ? "CommentBlock" : "CommentLine",
      value: text,
      start: start,
      end: end,
      loc: new (_location2 || _load_location2()).SourceLocation(startLoc, endLoc)
    };

    if (!this.isLookahead) {
      if (this.options.tokens) this.state.tokens.push(comment);
      this.state.comments.push(comment);
      this.addComment(comment);
    }
  }

  skipBlockComment() {
    const startLoc = this.state.curPosition();
    const start = this.state.pos;
    const end = this.input.indexOf("*/", this.state.pos += 2);
    if (end === -1) this.raise(this.state.pos - 2, "Unterminated comment");

    this.state.pos = end + 2;
    (_whitespace || _load_whitespace()).lineBreakG.lastIndex = start;
    let match;
    while ((match = (_whitespace || _load_whitespace()).lineBreakG.exec(this.input)) && match.index < this.state.pos) {
      ++this.state.curLine;
      this.state.lineStart = match.index + match[0].length;
    }

    this.pushComment(true, this.input.slice(start + 2, end), start, this.state.pos, startLoc, this.state.curPosition());
  }

  skipLineComment(startSkip) {
    const start = this.state.pos;
    const startLoc = this.state.curPosition();
    let ch = this.input.charCodeAt(this.state.pos += startSkip);
    if (this.state.pos < this.input.length) {
      while (ch !== 10 && ch !== 13 && ch !== 8232 && ch !== 8233 && ++this.state.pos < this.input.length) {
        ch = this.input.charCodeAt(this.state.pos);
      }
    }

    this.pushComment(false, this.input.slice(start + startSkip, this.state.pos), start, this.state.pos, startLoc, this.state.curPosition());
  }

  // Called at the start of the parse and after every token. Skips
  // whitespace and comments, and.

  skipSpace() {
    loop: while (this.state.pos < this.input.length) {
      const ch = this.input.charCodeAt(this.state.pos);
      switch (ch) {
        case 32: // space
        case 160:
          // non-breaking space
          ++this.state.pos;
          break;

        case 13:
          // '\r' carriage return
          if (this.input.charCodeAt(this.state.pos + 1) === 10) {
            ++this.state.pos;
          }

        case 10: // '\n' line feed
        case 8232: // line separator
        case 8233:
          // paragraph separator
          ++this.state.pos;
          ++this.state.curLine;
          this.state.lineStart = this.state.pos;
          break;

        case 47:
          // '/'
          switch (this.input.charCodeAt(this.state.pos + 1)) {
            case 42:
              // '*'
              this.skipBlockComment();
              break;

            case 47:
              this.skipLineComment(2);
              break;

            default:
              break loop;
          }
          break;

        default:
          if (ch > 8 && ch < 14 || ch >= 5760 && (_whitespace || _load_whitespace()).nonASCIIwhitespace.test(String.fromCharCode(ch))) {
            ++this.state.pos;
          } else {
            break loop;
          }
      }
    }
  }

  // Called at the end of every token. Sets `end`, `val`, and
  // maintains `context` and `exprAllowed`, and skips the space after
  // the token, so that the next one's `start` will point at the
  // right position.

  finishToken(type, val) {
    this.state.end = this.state.pos;
    this.state.endLoc = this.state.curPosition();
    const prevType = this.state.type;
    this.state.type = type;
    this.state.value = val;

    this.updateContext(prevType);
  }

  // ### Token reading

  // This is the function that is called to fetch the next token. It
  // is somewhat obscure, because it works in character codes rather
  // than characters, and because operator parsing has been inlined
  // into it.
  //
  // All in the name of speed.
  //
  readToken_dot() {
    const next = this.input.charCodeAt(this.state.pos + 1);
    if (next >= 48 && next <= 57) {
      return this.readNumber(true);
    }

    const next2 = this.input.charCodeAt(this.state.pos + 2);
    if (next === 46 && next2 === 46) {
      // 46 = dot '.'
      this.state.pos += 3;
      return this.finishToken((_types || _load_types()).types.ellipsis);
    } else {
      ++this.state.pos;
      return this.finishToken((_types || _load_types()).types.dot);
    }
  }

  readToken_slash() {
    // '/'
    if (this.state.exprAllowed) {
      ++this.state.pos;
      return this.readRegexp();
    }

    const next = this.input.charCodeAt(this.state.pos + 1);
    if (next === 61) {
      return this.finishOp((_types || _load_types()).types.assign, 2);
    } else {
      return this.finishOp((_types || _load_types()).types.slash, 1);
    }
  }

  readToken_mult_modulo(code) {
    // '%*'
    let type = code === 42 ? (_types || _load_types()).types.star : (_types || _load_types()).types.modulo;
    let width = 1;
    let next = this.input.charCodeAt(this.state.pos + 1);

    // Exponentiation operator **
    if (code === 42 && next === 42) {
      width++;
      next = this.input.charCodeAt(this.state.pos + 2);
      type = (_types || _load_types()).types.exponent;
    }

    if (next === 61) {
      width++;
      type = (_types || _load_types()).types.assign;
    }

    return this.finishOp(type, width);
  }

  readToken_pipe_amp(code) {
    // '|&'
    const next = this.input.charCodeAt(this.state.pos + 1);
    if (next === code) return this.finishOp(code === 124 ? (_types || _load_types()).types.logicalOR : (_types || _load_types()).types.logicalAND, 2);
    if (next === 61) return this.finishOp((_types || _load_types()).types.assign, 2);
    if (code === 124 && next === 125 && this.hasPlugin("flow")) return this.finishOp((_types || _load_types()).types.braceBarR, 2);
    return this.finishOp(code === 124 ? (_types || _load_types()).types.bitwiseOR : (_types || _load_types()).types.bitwiseAND, 1);
  }

  readToken_caret() {
    // '^'
    const next = this.input.charCodeAt(this.state.pos + 1);
    if (next === 61) {
      return this.finishOp((_types || _load_types()).types.assign, 2);
    } else {
      return this.finishOp((_types || _load_types()).types.bitwiseXOR, 1);
    }
  }

  readToken_plus_min(code) {
    // '+-'
    const next = this.input.charCodeAt(this.state.pos + 1);

    if (next === code) {
      if (next === 45 && !this.inModule && this.input.charCodeAt(this.state.pos + 2) === 62 && (_whitespace || _load_whitespace()).lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.pos))) {
        // A `-->` line comment
        this.skipLineComment(3);
        this.skipSpace();
        return this.nextToken();
      }
      return this.finishOp((_types || _load_types()).types.incDec, 2);
    }

    if (next === 61) {
      return this.finishOp((_types || _load_types()).types.assign, 2);
    } else {
      return this.finishOp((_types || _load_types()).types.plusMin, 1);
    }
  }

  readToken_lt_gt(code) {
    // '<>'
    const next = this.input.charCodeAt(this.state.pos + 1);
    let size = 1;

    if (next === code) {
      size = code === 62 && this.input.charCodeAt(this.state.pos + 2) === 62 ? 3 : 2;
      if (this.input.charCodeAt(this.state.pos + size) === 61) return this.finishOp((_types || _load_types()).types.assign, size + 1);
      return this.finishOp((_types || _load_types()).types.bitShift, size);
    }

    if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.state.pos + 2) === 45 && this.input.charCodeAt(this.state.pos + 3) === 45) {
      // `<!--`, an XML-style comment that should be interpreted as a line comment
      this.skipLineComment(4);
      this.skipSpace();
      return this.nextToken();
    }

    if (next === 61) {
      // <= | >=
      size = 2;
    }

    return this.finishOp((_types || _load_types()).types.relational, size);
  }

  readToken_eq_excl(code) {
    // '=!'
    const next = this.input.charCodeAt(this.state.pos + 1);
    if (next === 61) return this.finishOp((_types || _load_types()).types.equality, this.input.charCodeAt(this.state.pos + 2) === 61 ? 3 : 2);
    if (code === 61 && next === 62) {
      // '=>'
      this.state.pos += 2;
      return this.finishToken((_types || _load_types()).types.arrow);
    }
    return this.finishOp(code === 61 ? (_types || _load_types()).types.eq : (_types || _load_types()).types.bang, 1);
  }

  readToken_question() {
    // '?'
    const next = this.input.charCodeAt(this.state.pos + 1);
    const next2 = this.input.charCodeAt(this.state.pos + 2);
    if (next === 46 && !(next2 >= 48 && next2 <= 57)) {
      // '.' not followed by a number
      this.state.pos += 2;
      return this.finishToken((_types || _load_types()).types.questionDot);
    } else {
      ++this.state.pos;
      return this.finishToken((_types || _load_types()).types.question);
    }
  }

  getTokenFromCode(code) {
    switch (code) {
      case 35:
        // '#'
        if (this.hasPlugin("classPrivateProperties") && this.state.classLevel > 0) {
          ++this.state.pos;
          return this.finishToken((_types || _load_types()).types.hash);
        } else {
          this.raise(this.state.pos, `Unexpected character '${codePointToString(code)}'`);
        }

      // The interpretation of a dot depends on whether it is followed
      // by a digit or another two dots.

      case 46:
        // '.'
        return this.readToken_dot();

      // Punctuation tokens.
      case 40:
        ++this.state.pos;
        return this.finishToken((_types || _load_types()).types.parenL);
      case 41:
        ++this.state.pos;
        return this.finishToken((_types || _load_types()).types.parenR);
      case 59:
        ++this.state.pos;
        return this.finishToken((_types || _load_types()).types.semi);
      case 44:
        ++this.state.pos;
        return this.finishToken((_types || _load_types()).types.comma);
      case 91:
        ++this.state.pos;
        return this.finishToken((_types || _load_types()).types.bracketL);
      case 93:
        ++this.state.pos;
        return this.finishToken((_types || _load_types()).types.bracketR);

      case 123:
        if (this.hasPlugin("flow") && this.input.charCodeAt(this.state.pos + 1) === 124) {
          return this.finishOp((_types || _load_types()).types.braceBarL, 2);
        } else {
          ++this.state.pos;
          return this.finishToken((_types || _load_types()).types.braceL);
        }

      case 125:
        ++this.state.pos;
        return this.finishToken((_types || _load_types()).types.braceR);

      case 58:
        if (this.hasPlugin("functionBind") && this.input.charCodeAt(this.state.pos + 1) === 58) {
          return this.finishOp((_types || _load_types()).types.doubleColon, 2);
        } else {
          ++this.state.pos;
          return this.finishToken((_types || _load_types()).types.colon);
        }

      case 63:
        return this.readToken_question();
      case 64:
        ++this.state.pos;
        return this.finishToken((_types || _load_types()).types.at);

      case 96:
        // '`'
        ++this.state.pos;
        return this.finishToken((_types || _load_types()).types.backQuote);

      case 48:
        {
          // '0'
          const next = this.input.charCodeAt(this.state.pos + 1);
          if (next === 120 || next === 88) return this.readRadixNumber(16); // '0x', '0X' - hex number
          if (next === 111 || next === 79) return this.readRadixNumber(8); // '0o', '0O' - octal number
          if (next === 98 || next === 66) return this.readRadixNumber(2); // '0b', '0B' - binary number
        }
      // Anything else beginning with a digit is an integer, octal
      // number, or float.
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        // 1-9
        return this.readNumber(false);

      // Quotes produce strings.
      case 34:
      case 39:
        // '"', "'"
        return this.readString(code);

      // Operators are parsed inline in tiny state machines. '=' (61) is
      // often referred to. `finishOp` simply skips the amount of
      // characters it is given as second argument, and returns a token
      // of the type given by its first argument.

      case 47:
        // '/'
        return this.readToken_slash();

      case 37:
      case 42:
        // '%*'
        return this.readToken_mult_modulo(code);

      case 124:
      case 38:
        // '|&'
        return this.readToken_pipe_amp(code);

      case 94:
        // '^'
        return this.readToken_caret();

      case 43:
      case 45:
        // '+-'
        return this.readToken_plus_min(code);

      case 60:
      case 62:
        // '<>'
        return this.readToken_lt_gt(code);

      case 61:
      case 33:
        // '=!'
        return this.readToken_eq_excl(code);

      case 126:
        // '~'
        return this.finishOp((_types || _load_types()).types.tilde, 1);
    }

    this.raise(this.state.pos, `Unexpected character '${codePointToString(code)}'`);
  }

  finishOp(type, size) {
    const str = this.input.slice(this.state.pos, this.state.pos + size);
    this.state.pos += size;
    return this.finishToken(type, str);
  }

  readRegexp() {
    const start = this.state.pos;
    let escaped, inClass;
    for (;;) {
      if (this.state.pos >= this.input.length) this.raise(start, "Unterminated regular expression");
      const ch = this.input.charAt(this.state.pos);
      if ((_whitespace || _load_whitespace()).lineBreak.test(ch)) {
        this.raise(start, "Unterminated regular expression");
      }
      if (escaped) {
        escaped = false;
      } else {
        if (ch === "[") {
          inClass = true;
        } else if (ch === "]" && inClass) {
          inClass = false;
        } else if (ch === "/" && !inClass) {
          break;
        }
        escaped = ch === "\\";
      }
      ++this.state.pos;
    }
    const content = this.input.slice(start, this.state.pos);
    ++this.state.pos;
    // Need to use `readWord1` because '\uXXXX' sequences are allowed
    // here (don't ask).
    const mods = this.readWord1();
    if (mods) {
      const validFlags = /^[gmsiyu]*$/;
      if (!validFlags.test(mods)) this.raise(start, "Invalid regular expression flag");
    }
    return this.finishToken((_types || _load_types()).types.regexp, {
      pattern: content,
      flags: mods
    });
  }

  // Read an integer in the given radix. Return null if zero digits
  // were read, the integer value otherwise. When `len` is given, this
  // will return `null` unless the integer has exactly `len` digits.

  readInt(radix, len) {
    const start = this.state.pos;
    const forbiddenSiblings = radix === 16 ? forbiddenNumericSeparatorSiblings.hex : forbiddenNumericSeparatorSiblings.decBinOct;
    let total = 0;

    for (let i = 0, e = len == null ? Infinity : len; i < e; ++i) {
      const code = this.input.charCodeAt(this.state.pos);
      let val;

      if (this.hasPlugin("numericSeparator")) {
        const prev = this.input.charCodeAt(this.state.pos - 1);
        const next = this.input.charCodeAt(this.state.pos + 1);
        if (code === 95) {
          if (forbiddenSiblings.indexOf(prev) > -1 || forbiddenSiblings.indexOf(next) > -1 || (0, (_isNan || _load_isNan()).default)(next)) {
            this.raise(this.state.pos, "Invalid NumericLiteralSeparator");
          }

          // Ignore this _ character
          ++this.state.pos;
          continue;
        }
      }

      if (code >= 97) {
        val = code - 97 + 10; // a
      } else if (code >= 65) {
        val = code - 65 + 10; // A
      } else if (code >= 48 && code <= 57) {
        val = code - 48; // 0-9
      } else {
        val = Infinity;
      }
      if (val >= radix) break;
      ++this.state.pos;
      total = total * radix + val;
    }
    if (this.state.pos === start || len != null && this.state.pos - start !== len) return null;

    return total;
  }

  readRadixNumber(radix) {
    const start = this.state.pos;
    let isBigInt = false;

    this.state.pos += 2; // 0x
    const val = this.readInt(radix);
    if (val == null) this.raise(this.state.start + 2, "Expected number in radix " + radix);

    if (this.hasPlugin("bigInt")) {
      if (this.input.charCodeAt(this.state.pos) === 0x6e) {
        // 'n'
        ++this.state.pos;
        isBigInt = true;
      }
    }

    if ((0, (_identifier || _load_identifier()).isIdentifierStart)(this.fullCharCodeAtPos())) this.raise(this.state.pos, "Identifier directly after number");

    if (isBigInt) {
      const str = this.input.slice(start, this.state.pos).replace(/[_n]/g, "");
      return this.finishToken((_types || _load_types()).types.bigint, str);
    }

    return this.finishToken((_types || _load_types()).types.num, val);
  }

  // Read an integer, octal integer, or floating-point number.

  readNumber(startsWithDot) {
    const start = this.state.pos;
    let octal = this.input.charCodeAt(start) === 0x30; // '0'
    let isFloat = false;
    let isBigInt = false;

    if (!startsWithDot && this.readInt(10) === null) this.raise(start, "Invalid number");
    if (octal && this.state.pos == start + 1) octal = false; // number === 0

    let next = this.input.charCodeAt(this.state.pos);
    if (next === 0x2e && !octal) {
      // '.'
      ++this.state.pos;
      this.readInt(10);
      isFloat = true;
      next = this.input.charCodeAt(this.state.pos);
    }

    if ((next === 0x45 || next === 0x65) && !octal) {
      // 'Ee'
      next = this.input.charCodeAt(++this.state.pos);
      if (next === 0x2b || next === 0x2d) ++this.state.pos; // '+-'
      if (this.readInt(10) === null) this.raise(start, "Invalid number");
      isFloat = true;
      next = this.input.charCodeAt(this.state.pos);
    }

    if (this.hasPlugin("bigInt")) {
      if (next === 0x6e) {
        // 'n'
        // disallow floats and legacy octal syntax, new style octal ("0o") is handled in this.readRadixNumber
        if (isFloat || octal) this.raise(start, "Invalid BigIntLiteral");
        ++this.state.pos;
        isBigInt = true;
      }
    }

    if ((0, (_identifier || _load_identifier()).isIdentifierStart)(this.fullCharCodeAtPos())) this.raise(this.state.pos, "Identifier directly after number");

    // remove "_" for numeric literal separator, and "n" for BigInts
    const str = this.input.slice(start, this.state.pos).replace(/[_n]/g, "");

    if (isBigInt) {
      return this.finishToken((_types || _load_types()).types.bigint, str);
    }

    let val;
    if (isFloat) {
      val = parseFloat(str);
    } else if (!octal || str.length === 1) {
      val = parseInt(str, 10);
    } else if (this.state.strict) {
      this.raise(start, "Invalid number");
    } else if (/[89]/.test(str)) {
      val = parseInt(str, 10);
    } else {
      val = parseInt(str, 8);
    }
    return this.finishToken((_types || _load_types()).types.num, val);
  }

  // Read a string value, interpreting backslash-escapes.

  readCodePoint(throwOnInvalid) {
    const ch = this.input.charCodeAt(this.state.pos);
    let code;

    if (ch === 123) {
      // '{'
      const codePos = ++this.state.pos;
      code = this.readHexChar(this.input.indexOf("}", this.state.pos) - this.state.pos, throwOnInvalid);
      ++this.state.pos;
      if (code === null) {
        // $FlowFixMe (is this always non-null?)
        --this.state.invalidTemplateEscapePosition; // to point to the '\'' instead of the 'u'
      } else if (code > 0x10ffff) {
        if (throwOnInvalid) {
          this.raise(codePos, "Code point out of bounds");
        } else {
          this.state.invalidTemplateEscapePosition = codePos - 2;
          return null;
        }
      }
    } else {
      code = this.readHexChar(4, throwOnInvalid);
    }
    return code;
  }

  readString(quote) {
    let out = "",
        chunkStart = ++this.state.pos;
    for (;;) {
      if (this.state.pos >= this.input.length) this.raise(this.state.start, "Unterminated string constant");
      const ch = this.input.charCodeAt(this.state.pos);
      if (ch === quote) break;
      if (ch === 92) {
        // '\'
        out += this.input.slice(chunkStart, this.state.pos);
        // $FlowFixMe
        out += this.readEscapedChar(false);
        chunkStart = this.state.pos;
      } else {
        if ((0, (_whitespace || _load_whitespace()).isNewLine)(ch)) this.raise(this.state.start, "Unterminated string constant");
        ++this.state.pos;
      }
    }
    out += this.input.slice(chunkStart, this.state.pos++);
    return this.finishToken((_types || _load_types()).types.string, out);
  }

  // Reads template string tokens.

  readTmplToken() {
    let out = "",
        chunkStart = this.state.pos,
        containsInvalid = false;
    for (;;) {
      if (this.state.pos >= this.input.length) this.raise(this.state.start, "Unterminated template");
      const ch = this.input.charCodeAt(this.state.pos);
      if (ch === 96 || ch === 36 && this.input.charCodeAt(this.state.pos + 1) === 123) {
        // '`', '${'
        if (this.state.pos === this.state.start && this.match((_types || _load_types()).types.template)) {
          if (ch === 36) {
            this.state.pos += 2;
            return this.finishToken((_types || _load_types()).types.dollarBraceL);
          } else {
            ++this.state.pos;
            return this.finishToken((_types || _load_types()).types.backQuote);
          }
        }
        out += this.input.slice(chunkStart, this.state.pos);
        return this.finishToken((_types || _load_types()).types.template, containsInvalid ? null : out);
      }
      if (ch === 92) {
        // '\'
        out += this.input.slice(chunkStart, this.state.pos);
        const escaped = this.readEscapedChar(true);
        if (escaped === null) {
          containsInvalid = true;
        } else {
          out += escaped;
        }
        chunkStart = this.state.pos;
      } else if ((0, (_whitespace || _load_whitespace()).isNewLine)(ch)) {
        out += this.input.slice(chunkStart, this.state.pos);
        ++this.state.pos;
        switch (ch) {
          case 13:
            if (this.input.charCodeAt(this.state.pos) === 10) ++this.state.pos;
          case 10:
            out += "\n";
            break;
          default:
            out += String.fromCharCode(ch);
            break;
        }
        ++this.state.curLine;
        this.state.lineStart = this.state.pos;
        chunkStart = this.state.pos;
      } else {
        ++this.state.pos;
      }
    }
  }

  // Used to read escaped characters

  readEscapedChar(inTemplate) {
    const throwOnInvalid = !inTemplate;
    const ch = this.input.charCodeAt(++this.state.pos);
    ++this.state.pos;
    switch (ch) {
      case 110:
        return "\n"; // 'n' -> '\n'
      case 114:
        return "\r"; // 'r' -> '\r'
      case 120:
        {
          // 'x'
          const code = this.readHexChar(2, throwOnInvalid);
          return code === null ? null : String.fromCharCode(code);
        }
      case 117:
        {
          // 'u'
          const code = this.readCodePoint(throwOnInvalid);
          return code === null ? null : codePointToString(code);
        }
      case 116:
        return "\t"; // 't' -> '\t'
      case 98:
        return "\b"; // 'b' -> '\b'
      case 118:
        return "\u000b"; // 'v' -> '\u000b'
      case 102:
        return "\f"; // 'f' -> '\f'
      case 13:
        if (this.input.charCodeAt(this.state.pos) === 10) ++this.state.pos; // '\r\n'
      case 10:
        // ' \n'
        this.state.lineStart = this.state.pos;
        ++this.state.curLine;
        return "";
      default:
        if (ch >= 48 && ch <= 55) {
          const codePos = this.state.pos - 1;
          // $FlowFixMe
          let octalStr = this.input.substr(this.state.pos - 1, 3).match(/^[0-7]+/)[0];
          let octal = parseInt(octalStr, 8);
          if (octal > 255) {
            octalStr = octalStr.slice(0, -1);
            octal = parseInt(octalStr, 8);
          }
          if (octal > 0) {
            if (inTemplate) {
              this.state.invalidTemplateEscapePosition = codePos;
              return null;
            } else if (this.state.strict) {
              this.raise(codePos, "Octal literal in strict mode");
            } else if (!this.state.containsOctal) {
              // These properties are only used to throw an error for an octal which occurs
              // in a directive which occurs prior to a "use strict" directive.
              this.state.containsOctal = true;
              this.state.octalPosition = codePos;
            }
          }
          this.state.pos += octalStr.length - 1;
          return String.fromCharCode(octal);
        }
        return String.fromCharCode(ch);
    }
  }

  // Used to read character escape sequences ('\x', '\u').

  readHexChar(len, throwOnInvalid) {
    const codePos = this.state.pos;
    const n = this.readInt(16, len);
    if (n === null) {
      if (throwOnInvalid) {
        this.raise(codePos, "Bad character escape sequence");
      } else {
        this.state.pos = codePos - 1;
        this.state.invalidTemplateEscapePosition = codePos - 1;
      }
    }
    return n;
  }

  // Read an identifier, and return it as a string. Sets `this.state.containsEsc`
  // to whether the word contained a '\u' escape.
  //
  // Incrementally adds only escaped chars, adding other chunks as-is
  // as a micro-optimization.

  readWord1() {
    this.state.containsEsc = false;
    let word = "",
        first = true,
        chunkStart = this.state.pos;
    while (this.state.pos < this.input.length) {
      const ch = this.fullCharCodeAtPos();
      if ((0, (_identifier || _load_identifier()).isIdentifierChar)(ch)) {
        this.state.pos += ch <= 0xffff ? 1 : 2;
      } else if (ch === 92) {
        // "\"
        this.state.containsEsc = true;

        word += this.input.slice(chunkStart, this.state.pos);
        const escStart = this.state.pos;

        if (this.input.charCodeAt(++this.state.pos) !== 117) {
          // "u"
          this.raise(this.state.pos, "Expecting Unicode escape sequence \\uXXXX");
        }

        ++this.state.pos;
        const esc = this.readCodePoint(true);
        // $FlowFixMe (thinks esc may be null, but throwOnInvalid is true)
        if (!(first ? (_identifier || _load_identifier()).isIdentifierStart : (_identifier || _load_identifier()).isIdentifierChar)(esc, true)) {
          this.raise(escStart, "Invalid Unicode escape");
        }

        // $FlowFixMe
        word += codePointToString(esc);
        chunkStart = this.state.pos;
      } else {
        break;
      }
      first = false;
    }
    return word + this.input.slice(chunkStart, this.state.pos);
  }

  // Read an identifier or keyword token. Will check for reserved
  // words when necessary.

  readWord() {
    const word = this.readWord1();
    let type = (_types || _load_types()).types.name;

    if (this.isKeyword(word)) {
      if (this.state.containsEsc) {
        this.raise(this.state.pos, `Escape sequence in keyword ${word}`);
      }

      type = (_types || _load_types()).keywords[word];
    }

    return this.finishToken(type, word);
  }

  braceIsBlock(prevType) {
    if (prevType === (_types || _load_types()).types.colon) {
      const parent = this.curContext();
      if (parent === (_context || _load_context()).types.braceStatement || parent === (_context || _load_context()).types.braceExpression) {
        return !parent.isExpr;
      }
    }

    if (prevType === (_types || _load_types()).types._return) {
      return (_whitespace || _load_whitespace()).lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start));
    }

    if (prevType === (_types || _load_types()).types._else || prevType === (_types || _load_types()).types.semi || prevType === (_types || _load_types()).types.eof || prevType === (_types || _load_types()).types.parenR) {
      return true;
    }

    if (prevType === (_types || _load_types()).types.braceL) {
      return this.curContext() === (_context || _load_context()).types.braceStatement;
    }

    if (prevType === (_types || _load_types()).types.relational) {
      // `class C<T> { ... }`
      return true;
    }

    return !this.state.exprAllowed;
  }

  updateContext(prevType) {
    const type = this.state.type;
    let update;

    if (type.keyword && (prevType === (_types || _load_types()).types.dot || prevType === (_types || _load_types()).types.questionDot)) {
      this.state.exprAllowed = false;
    } else if (update = type.updateContext) {
      update.call(this, prevType);
    } else {
      this.state.exprAllowed = type.beforeExpr;
    }
  }
}
exports.default = Tokenizer;