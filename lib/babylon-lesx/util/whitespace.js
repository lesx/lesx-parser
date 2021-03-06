"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isNewLine = isNewLine;


// Matches a whole line break (where CRLF is considered a single
// line break). Used to count lines.

const lineBreak = exports.lineBreak = /\r\n?|\n|\u2028|\u2029/;
const lineBreakG = exports.lineBreakG = new RegExp(lineBreak.source, "g");

function isNewLine(code) {
  return code === 10 || code === 13 || code === 0x2028 || code === 0x2029;
}

const nonASCIIwhitespace = exports.nonASCIIwhitespace = /[\u1680\u180e\u2000-\u200a\u202f\u205f\u3000\ufeff]/;