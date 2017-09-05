"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.plugins = undefined;

var _options;

function _load_options() {
  return _options = require("../options");
}

var _statement;

function _load_statement() {
  return _statement = _interopRequireDefault(require("./statement"));
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const plugins = exports.plugins = {};

class Parser extends (_statement || _load_statement()).default {
  constructor(options, input) {
    options = (0, (_options || _load_options()).getOptions)(options);
    super(options, input);

    this.options = options;
    this.inModule = this.options.sourceType === "module";
    this.input = input;
    this.plugins = pluginsMap(this.options.plugins);
    this.filename = options.sourceFilename;

    // If enabled, skip leading hashbang line.
    if (this.state.pos === 0 && this.input[0] === "#" && this.input[1] === "!") {
      this.skipLineComment(2);
    }
  }

  parse() {
    const file = this.startNode();
    const program = this.startNode();
    this.nextToken();
    return this.parseTopLevel(file, program);
  }
}

exports.default = Parser;
function pluginsMap(pluginList) {
  const pluginMap = {};
  for (const name of pluginList) {
    pluginMap[name] = true;
  }
  return pluginMap;
}