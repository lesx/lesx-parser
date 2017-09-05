"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _types;

function _load_types() {
  return _types = require("../tokenizer/types");
}

var _node;

function _load_node() {
  return _node = require("./node");
}

class LValParser extends (_node || _load_node()).NodeUtils {

  // Convert existing expression atom to assignable pattern
  // if possible.

  toAssignable(node, isBinding, contextDescription) {
    if (node) {
      switch (node.type) {
        case "Identifier":
        case "ObjectPattern":
        case "ArrayPattern":
        case "AssignmentPattern":
          break;

        case "ObjectExpression":
          node.type = "ObjectPattern";
          for (const [index, prop] of node.properties.entries()) {
            this.toAssignableObjectExpressionProp(prop, isBinding, index === node.properties.length - 1);
          }
          break;

        case "ObjectProperty":
          this.toAssignable(node.value, isBinding, contextDescription);
          break;

        case "SpreadElement":
          {
            this.checkToRestConversion(node);

            node.type = "RestElement";
            const arg = node.argument;
            this.toAssignable(arg, isBinding, contextDescription);
            break;
          }

        case "ArrayExpression":
          node.type = "ArrayPattern";
          this.toAssignableList(node.elements, isBinding, contextDescription);
          break;

        case "AssignmentExpression":
          if (node.operator === "=") {
            node.type = "AssignmentPattern";
            delete node.operator;
          } else {
            this.raise(node.left.end, "Only '=' operator can be used for specifying default value.");
          }
          break;

        case "MemberExpression":
          if (!isBinding) break;

        default:
          {
            const message = "Invalid left-hand side" + (contextDescription ? " in " + contextDescription : /* istanbul ignore next */"expression");
            this.raise(node.start, message);
          }
      }
    }
    return node;
  }
  // Forward-declaration: defined in statement.js

  // Forward-declaration: defined in expression.js


  toAssignableObjectExpressionProp(prop, isBinding, isLast) {
    if (prop.type === "ObjectMethod") {
      const error = prop.kind === "get" || prop.kind === "set" ? "Object pattern can't contain getter or setter" : "Object pattern can't contain methods";

      this.raise(prop.key.start, error);
    } else if (prop.type === "SpreadElement" && !isLast) {
      this.raise(prop.start, "The rest element has to be the last element when destructuring");
    } else {
      this.toAssignable(prop, isBinding, "object destructuring pattern");
    }
  }

  // Convert list of expression atoms to binding list.

  toAssignableList(exprList, isBinding, contextDescription) {
    let end = exprList.length;
    if (end) {
      const last = exprList[end - 1];
      if (last && last.type === "RestElement") {
        --end;
      } else if (last && last.type === "SpreadElement") {
        last.type = "RestElement";
        const arg = last.argument;
        this.toAssignable(arg, isBinding, contextDescription);
        if (arg.type !== "Identifier" && arg.type !== "MemberExpression" && arg.type !== "ArrayPattern") {
          this.unexpected(arg.start);
        }
        --end;
      }
    }
    for (let i = 0; i < end; i++) {
      const elt = exprList[i];
      if (elt && elt.type === "SpreadElement") this.raise(elt.start, "The rest element has to be the last element when destructuring");
      if (elt) this.toAssignable(elt, isBinding, contextDescription);
    }
    return exprList;
  }

  // Convert list of expression atoms to a list of

  toReferencedList(exprList) {
    return exprList;
  }

  // Parses spread element.

  parseSpread(refShorthandDefaultPos) {
    const node = this.startNode();
    this.next();
    node.argument = this.parseMaybeAssign(false, refShorthandDefaultPos);
    return this.finishNode(node, "SpreadElement");
  }

  parseRest() {
    const node = this.startNode();
    this.next();
    node.argument = this.parseBindingAtom();
    return this.finishNode(node, "RestElement");
  }

  shouldAllowYieldIdentifier() {
    return this.match((_types || _load_types()).types._yield) && !this.state.strict && !this.state.inGenerator;
  }

  parseBindingIdentifier() {
    return this.parseIdentifier(this.shouldAllowYieldIdentifier());
  }

  // Parses lvalue (assignable) atom.
  parseBindingAtom() {
    switch (this.state.type) {
      case (_types || _load_types()).types._yield:
      case (_types || _load_types()).types.name:
        return this.parseBindingIdentifier();

      case (_types || _load_types()).types.bracketL:
        {
          const node = this.startNode();
          this.next();
          node.elements = this.parseBindingList((_types || _load_types()).types.bracketR, true);
          return this.finishNode(node, "ArrayPattern");
        }

      case (_types || _load_types()).types.braceL:
        return this.parseObj(true);

      default:
        throw this.unexpected();
    }
  }

  parseBindingList(close, allowEmpty, allowModifiers) {
    const elts = [];
    let first = true;
    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect((_types || _load_types()).types.comma);
      }
      if (allowEmpty && this.match((_types || _load_types()).types.comma)) {
        // $FlowFixMe This method returns `$ReadOnlyArray<?Pattern>` if `allowEmpty` is set.
        elts.push(null);
      } else if (this.eat(close)) {
        break;
      } else if (this.match((_types || _load_types()).types.ellipsis)) {
        elts.push(this.parseAssignableListItemTypes(this.parseRest()));
        this.expect(close);
        break;
      } else {
        const decorators = [];
        if (this.match((_types || _load_types()).types.at) && this.hasPlugin("decorators2")) {
          this.raise(this.state.start, "Stage 2 decorators cannot be used to decorate parameters");
        }
        while (this.match((_types || _load_types()).types.at)) {
          decorators.push(this.parseDecorator());
        }
        elts.push(this.parseAssignableListItem(allowModifiers, decorators));
      }
    }
    return elts;
  }

  parseAssignableListItem(allowModifiers, decorators) {
    const left = this.parseMaybeDefault();
    this.parseAssignableListItemTypes(left);
    const elt = this.parseMaybeDefault(left.start, left.loc.start, left);
    if (decorators.length) {
      left.decorators = decorators;
    }
    return elt;
  }

  parseAssignableListItemTypes(param) {
    return param;
  }

  // Parses assignment pattern around given atom if possible.

  parseMaybeDefault(startPos, startLoc, left) {
    startLoc = startLoc || this.state.startLoc;
    startPos = startPos || this.state.start;
    left = left || this.parseBindingAtom();
    if (!this.eat((_types || _load_types()).types.eq)) return left;

    const node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.right = this.parseMaybeAssign();
    return this.finishNode(node, "AssignmentPattern");
  }

  // Verify that a node is an lval — something that can be assigned
  // to.

  checkLVal(expr, isBinding, checkClashes, contextDescription) {
    switch (expr.type) {
      case "Identifier":
        this.checkReservedWord(expr.name, expr.start, false, true);

        if (checkClashes) {
          // we need to prefix this with an underscore for the cases where we have a key of
          // `__proto__`. there's a bug in old V8 where the following wouldn't work:
          //
          //   > var obj = Object.create(null);
          //   undefined
          //   > obj.__proto__
          //   null
          //   > obj.__proto__ = true;
          //   true
          //   > obj.__proto__
          //   null
          const key = `_${expr.name}`;

          if (checkClashes[key]) {
            this.raise(expr.start, "Argument name clash in strict mode");
          } else {
            checkClashes[key] = true;
          }
        }
        break;

      case "MemberExpression":
        if (isBinding) this.raise(expr.start, "Binding member expression");
        break;

      case "ObjectPattern":
        for (let prop of expr.properties) {
          if (prop.type === "ObjectProperty") prop = prop.value;
          this.checkLVal(prop, isBinding, checkClashes, "object destructuring pattern");
        }
        break;

      case "ArrayPattern":
        for (const elem of expr.elements) {
          if (elem) this.checkLVal(elem, isBinding, checkClashes, "array destructuring pattern");
        }
        break;

      case "AssignmentPattern":
        this.checkLVal(expr.left, isBinding, checkClashes, "assignment pattern");
        break;

      case "RestElement":
        this.checkLVal(expr.argument, isBinding, checkClashes, "rest element");
        break;

      default:
        {
          const message = (isBinding ? /* istanbul ignore next */"Binding invalid" : "Invalid") + " left-hand side" + (contextDescription ? " in " + contextDescription : /* istanbul ignore next */"expression");
          this.raise(expr.start, message);
        }
    }
  }

  checkToRestConversion(node) {
    const validArgumentTypes = ["Identifier", "MemberExpression"];

    if (validArgumentTypes.indexOf(node.argument.type) !== -1) {
      return;
    }

    this.raise(node.argument.start, "Invalid rest operator's argument");
  }
}
exports.default = LValParser;
module.exports = exports["default"];