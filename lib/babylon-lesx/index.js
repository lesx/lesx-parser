"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.tokTypes = undefined;
exports.parse = parse;
exports.parseExpression = parseExpression;

var _parser;

function _load_parser() {
  return _parser = _interopRequireDefault(require("./parser"));
}

var _parser2;

function _load_parser2() {
  return _parser2 = require("./parser");
}

require("./parser/util");

require("./parser/statement");

require("./parser/lval");

require("./parser/expression");

require("./parser/node");

require("./parser/location");

require("./parser/comments");

var _types;

function _load_types() {
  return _types = require("./tokenizer/types");
}

require("./tokenizer");

require("./tokenizer/context");

var _estree;

function _load_estree() {
  return _estree = _interopRequireDefault(require("./plugins/estree"));
}

var _flow;

function _load_flow() {
  return _flow = _interopRequireDefault(require("./plugins/flow"));
}

var _lesx;

function _load_lesx() {
  return _lesx = _interopRequireDefault(require("./plugins/lesx"));
}

var _typescript;

function _load_typescript() {
  return _typescript = _interopRequireDefault(require("./plugins/typescript"));
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(_parser2 || _load_parser2()).plugins.estree = (_estree || _load_estree()).default;
(_parser2 || _load_parser2()).plugins.flow = (_flow || _load_flow()).default;
(_parser2 || _load_parser2()).plugins.lesx = (_lesx || _load_lesx()).default;
(_parser2 || _load_parser2()).plugins.typescript = (_typescript || _load_typescript()).default;

function parse(input, options) {
  return getParser(options, input).parse();
}

function parseExpression(input, options) {
  const parser = getParser(options, input);
  if (parser.options.strictMode) {
    parser.state.strict = true;
  }
  return parser.getExpression();
}

exports.tokTypes = (_types || _load_types()).types;


function getParser(options, input) {
  const cls = options && options.plugins ? getParserClass(options.plugins) : (_parser || _load_parser()).default;
  return new cls(options, input);
}

const parserClassCache = {};

/** Get a Parser class with plugins applied. */
function getParserClass(pluginsFromOptions) {
  if (pluginsFromOptions.indexOf("decorators") >= 0 && pluginsFromOptions.indexOf("decorators2") >= 0) {
    throw new Error("Cannot use decorators and decorators2 plugin together");
  }

  // Filter out just the plugins that have an actual mixin associated with them.
  let pluginList = pluginsFromOptions.filter(p => p === "estree" || p === "flow" || p === "lesx" || p === "typescript");

  if (pluginList.indexOf("flow") >= 0) {
    // ensure flow plugin loads last
    pluginList = pluginList.filter(plugin => plugin !== "flow");
    pluginList.push("flow");
  }

  if (pluginList.indexOf("flow") >= 0 && pluginList.indexOf("typescript") >= 0) {
    throw new Error("Cannot combine flow and typescript plugins.");
  }

  if (pluginList.indexOf("typescript") >= 0) {
    // ensure typescript plugin loads last
    pluginList = pluginList.filter(plugin => plugin !== "typescript");
    pluginList.push("typescript");
  }

  if (pluginList.indexOf("estree") >= 0) {
    // ensure estree plugin loads first
    pluginList = pluginList.filter(plugin => plugin !== "estree");
    pluginList.unshift("estree");
  }

  const key = pluginList.join("/");
  let cls = parserClassCache[key];
  if (!cls) {
    cls = (_parser || _load_parser()).default;
    for (const plugin of pluginList) {
      cls = (_parser2 || _load_parser2()).plugins[plugin](cls);
    }
    parserClassCache[key] = cls;
  }
  return cls;
}