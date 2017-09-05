"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _types;

function _load_types() {
  return _types = require("../tokenizer/types");
}

var _types2;

function _load_types2() {
  return _types2 = _interopRequireWildcard(require("../types"));
}

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function isSimpleProperty(node) {
  return node != null && node.type === "Property" && node.kind === "init" && node.method === false;
}

exports.default = superClass => class extends superClass {
  estreeParseRegExpLiteral({ pattern, flags }) {
    let regex = null;
    try {
      regex = new RegExp(pattern, flags);
    } catch (e) {
      // In environments that don't support these flags value will
      // be null as the regex can't be represented natively.
    }
    const node = this.estreeParseLiteral(regex);
    node.regex = { pattern, flags };

    return node;
  }

  estreeParseLiteral(value) {
    return this.parseLiteral(value, "Literal");
  }

  directiveToStmt(directive) {
    const directiveLiteral = directive.value;

    const stmt = this.startNodeAt(directive.start, directive.loc.start);
    const expression = this.startNodeAt(directiveLiteral.start, directiveLiteral.loc.start);

    expression.value = directiveLiteral.value;
    expression.raw = directiveLiteral.extra.raw;

    stmt.expression = this.finishNodeAt(expression, "Literal", directiveLiteral.end, directiveLiteral.loc.end);
    stmt.directive = directiveLiteral.extra.raw.slice(1, -1);

    return this.finishNodeAt(stmt, "ExpressionStatement", directive.end, directive.loc.end);
  }

  // ==================================
  // Overrides
  // ==================================

  checkDeclaration(node) {
    if (isSimpleProperty(node)) {
      // $FlowFixMe
      this.checkDeclaration(node.value);
    } else {
      super.checkDeclaration(node);
    }
  }

  checkGetterSetterParamCount(prop) {
    const paramCount = prop.kind === "get" ? 0 : 1;
    // $FlowFixMe (prop.value present for ObjectMethod, but for ClassMethod should use prop.params?)
    if (prop.value.params.length !== paramCount) {
      const start = prop.start;
      if (prop.kind === "get") {
        this.raise(start, "getter should have no params");
      } else {
        this.raise(start, "setter should have exactly one param");
      }
    }
  }

  checkLVal(expr, isBinding, checkClashes, contextDescription) {
    switch (expr.type) {
      case "ObjectPattern":
        expr.properties.forEach(prop => {
          this.checkLVal(prop.type === "Property" ? prop.value : prop, isBinding, checkClashes, "object destructuring pattern");
        });
        break;
      default:
        super.checkLVal(expr, isBinding, checkClashes, contextDescription);
    }
  }

  checkPropClash(prop, propHash) {
    if (prop.computed || !isSimpleProperty(prop)) return;

    const key = prop.key;
    // It is either an Identifier or a String/NumericLiteral
    const name = key.type === "Identifier" ? key.name : String(key.value);

    if (name === "__proto__") {
      if (propHash.proto) this.raise(key.start, "Redefinition of __proto__ property");
      propHash.proto = true;
    }
  }

  isStrictBody(node, isExpression) {
    if (!isExpression && node.body.body.length > 0) {
      for (const directive of node.body.body) {
        if (directive.type === "ExpressionStatement" && directive.expression.type === "Literal") {
          if (directive.expression.value === "use strict") return true;
        } else {
          // Break for the first non literal expression
          break;
        }
      }
    }

    return false;
  }

  isValidDirective(stmt) {
    return stmt.type === "ExpressionStatement" && stmt.expression.type === "Literal" && typeof stmt.expression.value === "string" && (!stmt.expression.extra || !stmt.expression.extra.parenthesized);
  }

  stmtToDirective(stmt) {
    const directive = super.stmtToDirective(stmt);
    const value = stmt.expression.value;

    // Reset value to the actual value as in estree mode we want
    // the stmt to have the real value and not the raw value
    directive.value.value = value;

    return directive;
  }

  parseBlockBody(node, allowDirectives, topLevel, end) {
    super.parseBlockBody(node, allowDirectives, topLevel, end);

    const directiveStatements = node.directives.map(d => this.directiveToStmt(d));
    node.body = directiveStatements.concat(node.body);
    delete node.directives;
  }

  parseClassMethod(classBody, method, isGenerator, isAsync, isConstructor) {
    this.parseMethod(method, isGenerator, isAsync, isConstructor, "MethodDefinition");
    if (method.typeParameters) {
      // $FlowIgnore
      method.value.typeParameters = method.typeParameters;
      delete method.typeParameters;
    }
    classBody.body.push(method);
  }

  parseExprAtom(refShorthandDefaultPos) {
    switch (this.state.type) {
      case (_types || _load_types()).types.regexp:
        return this.estreeParseRegExpLiteral(this.state.value);

      case (_types || _load_types()).types.num:
      case (_types || _load_types()).types.string:
        return this.estreeParseLiteral(this.state.value);

      case (_types || _load_types()).types._null:
        return this.estreeParseLiteral(null);

      case (_types || _load_types()).types._true:
        return this.estreeParseLiteral(true);

      case (_types || _load_types()).types._false:
        return this.estreeParseLiteral(false);

      default:
        return super.parseExprAtom(refShorthandDefaultPos);
    }
  }

  parseLiteral(value, type, startPos, startLoc) {
    const node = super.parseLiteral(value, type, startPos, startLoc);
    node.raw = node.extra.raw;
    delete node.extra;

    return node;
  }

  parseMethod(node, isGenerator, isAsync, isConstructor, type) {
    let funcNode = this.startNode();
    funcNode.kind = node.kind; // provide kind, so super method correctly sets state
    funcNode = super.parseMethod(funcNode, isGenerator, isAsync, isConstructor, "FunctionExpression");
    delete funcNode.kind;
    // $FlowIgnore
    node.value = funcNode;

    return this.finishNode(node, type);
  }

  parseObjectMethod(prop, isGenerator, isAsync, isPattern) {
    const node = super.parseObjectMethod(prop, isGenerator, isAsync, isPattern);

    if (node) {
      node.type = "Property";
      if (node.kind === "method") node.kind = "init";
      node.shorthand = false;
    }

    return node;
  }

  parseObjectProperty(prop, startPos, startLoc, isPattern, refShorthandDefaultPos) {
    const node = super.parseObjectProperty(prop, startPos, startLoc, isPattern, refShorthandDefaultPos);

    if (node) {
      node.kind = "init";
      node.type = "Property";
    }

    return node;
  }

  toAssignable(node, isBinding, contextDescription) {
    if (isSimpleProperty(node)) {
      this.toAssignable(node.value, isBinding, contextDescription);

      return node;
    }

    return super.toAssignable(node, isBinding, contextDescription);
  }

  toAssignableObjectExpressionProp(prop, isBinding, isLast) {
    if (prop.kind === "get" || prop.kind === "set") {
      this.raise(prop.key.start, "Object pattern can't contain getter or setter");
    } else if (prop.method) {
      this.raise(prop.key.start, "Object pattern can't contain methods");
    } else {
      super.toAssignableObjectExpressionProp(prop, isBinding, isLast);
    }
  }
};

module.exports = exports["default"];