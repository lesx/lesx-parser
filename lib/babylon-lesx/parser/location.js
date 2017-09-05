"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _location;

function _load_location() {
  return _location = require("../util/location");
}

var _comments;

function _load_comments() {
  return _comments = _interopRequireDefault(require("./comments"));
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// This function is used to raise exceptions on parse errors. It
// takes an offset integer (into the current `input`) to indicate
// the location of the error, attaches the position to the end
// of the error message, and then raises a `SyntaxError` with that
// message.

class LocationParser extends (_comments || _load_comments()).default {
  raise(pos, message, missingPluginNames) {
    const loc = (0, (_location || _load_location()).getLineInfo)(this.input, pos);
    message += ` (${loc.line}:${loc.column})`;
    // $FlowIgnore
    const err = new SyntaxError(message);
    err.pos = pos;
    err.loc = loc;
    if (missingPluginNames) {
      err.missingPlugin = missingPluginNames;
    }
    throw err;
  }
}
exports.default = LocationParser;
module.exports = exports["default"];