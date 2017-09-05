"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SourceLocation = exports.Position = undefined;
exports.getLineInfo = getLineInfo;

var _whitespace;

function _load_whitespace() {
  return _whitespace = require("./whitespace");
}

// These are used when `options.locations` is on, for the
// `startLoc` and `endLoc` properties.

class Position {

  constructor(line, col) {
    this.line = line;
    this.column = col;
  }
}

exports.Position = Position;
class SourceLocation {

  constructor(start, end) {
    this.start = start;
    // $FlowIgnore (may start as null, but initialized later)
    this.end = end;
  }
}

exports.SourceLocation = SourceLocation; // The `getLineInfo` function is mostly useful when the
// `locations` option is off (for performance reasons) and you
// want to find the line/column position for a given character
// offset. `input` should be the code string that the offset refers
// into.

function getLineInfo(input, offset) {
  for (let line = 1, cur = 0;;) {
    (_whitespace || _load_whitespace()).lineBreakG.lastIndex = cur;
    const match = (_whitespace || _load_whitespace()).lineBreakG.exec(input);
    if (match && match.index < offset) {
      ++line;
      cur = match.index + match[0].length;
    } else {
      return new Position(line, offset - cur);
    }
  }
  // istanbul ignore next
  throw new Error("Unreachable");
}