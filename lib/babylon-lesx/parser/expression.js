"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _create;

function _load_create() {
  return _create = _interopRequireDefault(require("babel-runtime/core-js/object/create"));
}

var _types;

function _load_types() {
  return _types = require("../tokenizer/types");
}

var _types2;

function _load_types2() {
  return _types2 = _interopRequireWildcard(require("../types"));
}

var _lval;

function _load_lval() {
  return _lval = _interopRequireDefault(require("./lval"));
}

var _identifier;

function _load_identifier() {
  return _identifier = require("../util/identifier");
}

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint max-len: 0 */

// A recursive descent parser operates by defining functions for all
// syntactic elements, and recursively calling those, each function
// advancing the input stream and returning an AST node. Precedence
// of constructs (for example, the fact that `!x[1]` means `!(x[1])`
// instead of `(!x)[1]` is handled by the fact that the parser
// function that parses unary prefix operators is called first, and
// in turn calls the function that parses `[]` subscripts — that
// way, it'll receive the node for `x[1]` already parsed, and wraps
// *that* in the unary operator node.
//
// Acorn uses an [operator precedence parser][opp] to handle binary
// operator precedence, because it is much more compact than using
// the technique outlined above, which uses different, nesting
// functions to specify precedence, for all of the ten binary
// precedence levels that JavaScript defines.
//
// [opp]: http://en.wikipedia.org/wiki/Operator-precedence_parser

class ExpressionParser extends (_lval || _load_lval()).default {

  // Check if property name clashes with already added.
  // Object/class getters and setters are not allowed to clash —
  // either with each other or with an init property — and in
  // strict mode, init properties are also not allowed to be repeated.

  checkPropClash(prop, propHash) {
    if (prop.computed || prop.kind) return;

    const key = prop.key;
    // It is either an Identifier or a String/NumericLiteral
    const name = key.type === "Identifier" ? key.name : String(key.value);

    if (name === "__proto__") {
      if (propHash.proto) this.raise(key.start, "Redefinition of __proto__ property");
      propHash.proto = true;
    }
  }

  // Convenience method to parse an Expression only

  // Forward-declaration: defined in statement.js
  getExpression() {
    this.nextToken();
    const expr = this.parseExpression();
    if (!this.match((_types || _load_types()).types.eof)) {
      this.unexpected();
    }
    expr.comments = this.state.comments;
    return expr;
  }

  // ### Expression parsing

  // These nest, from the most general expression type at the top to
  // 'atomic', nondivisible expression types at the bottom. Most of
  // the functions will simply let the function (s) below them parse,
  // and, *if* the syntactic construct they handle is present, wrap
  // the AST node that the inner parser gave them in another node.

  // Parse a full expression. The optional arguments are used to
  // forbid the `in` operator (in for loops initialization expressions)
  // and provide reference for storing '=' operator inside shorthand
  // property assignment in contexts where both object expression
  // and object pattern might appear (so it's possible to raise
  // delayed syntax error at correct position).

  parseExpression(noIn, refShorthandDefaultPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const expr = this.parseMaybeAssign(noIn, refShorthandDefaultPos);
    if (this.match((_types || _load_types()).types.comma)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.expressions = [expr];
      while (this.eat((_types || _load_types()).types.comma)) {
        node.expressions.push(this.parseMaybeAssign(noIn, refShorthandDefaultPos));
      }
      this.toReferencedList(node.expressions);
      return this.finishNode(node, "SequenceExpression");
    }
    return expr;
  }

  // Parse an assignment expression. This includes applications of
  // operators like `+=`.

  parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    if (this.match((_types || _load_types()).types._yield) && this.state.inGenerator) {
      let left = this.parseYield();
      if (afterLeftParse) left = afterLeftParse.call(this, left, startPos, startLoc);
      return left;
    }

    let failOnShorthandAssign;
    if (refShorthandDefaultPos) {
      failOnShorthandAssign = false;
    } else {
      refShorthandDefaultPos = { start: 0 };
      failOnShorthandAssign = true;
    }

    if (this.match((_types || _load_types()).types.parenL) || this.match((_types || _load_types()).types.name)) {
      this.state.potentialArrowAt = this.state.start;
    }

    let left = this.parseMaybeConditional(noIn, refShorthandDefaultPos, refNeedsArrowPos);
    if (afterLeftParse) left = afterLeftParse.call(this, left, startPos, startLoc);
    if (this.state.type.isAssign) {
      const node = this.startNodeAt(startPos, startLoc);
      node.operator = this.state.value;
      node.left = this.match((_types || _load_types()).types.eq) ? this.toAssignable(left, undefined, "assignment expression") : left;
      refShorthandDefaultPos.start = 0; // reset because shorthand default was used correctly

      this.checkLVal(left, undefined, undefined, "assignment expression");

      if (left.extra && left.extra.parenthesized) {
        let errorMsg;
        if (left.type === "ObjectPattern") {
          errorMsg = "`({a}) = 0` use `({a} = 0)`";
        } else if (left.type === "ArrayPattern") {
          errorMsg = "`([a]) = 0` use `([a] = 0)`";
        }
        if (errorMsg) {
          this.raise(left.start, `You're trying to assign to a parenthesized expression, eg. instead of ${errorMsg}`);
        }
      }

      this.next();
      node.right = this.parseMaybeAssign(noIn);
      return this.finishNode(node, "AssignmentExpression");
    } else if (failOnShorthandAssign && refShorthandDefaultPos.start) {
      this.unexpected(refShorthandDefaultPos.start);
    }

    return left;
  }

  // Parse a ternary conditional (`?:`) operator.

  parseMaybeConditional(noIn, refShorthandDefaultPos, refNeedsArrowPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const potentialArrowAt = this.state.potentialArrowAt;
    const expr = this.parseExprOps(noIn, refShorthandDefaultPos);

    if (expr.type === "ArrowFunctionExpression" && expr.start === potentialArrowAt) {
      return expr;
    }
    if (refShorthandDefaultPos && refShorthandDefaultPos.start) return expr;

    return this.parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos);
  }

  parseConditional(expr, noIn, startPos, startLoc,
  // FIXME: Disabling this for now since can't seem to get it to play nicely
  refNeedsArrowPos) {
    if (this.eat((_types || _load_types()).types.question)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.test = expr;
      node.consequent = this.parseMaybeAssign();
      this.expect((_types || _load_types()).types.colon);
      node.alternate = this.parseMaybeAssign(noIn);
      return this.finishNode(node, "ConditionalExpression");
    }
    return expr;
  }

  // Start the precedence parser.

  parseExprOps(noIn, refShorthandDefaultPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const potentialArrowAt = this.state.potentialArrowAt;
    const expr = this.parseMaybeUnary(refShorthandDefaultPos);

    if (expr.type === "ArrowFunctionExpression" && expr.start === potentialArrowAt) {
      return expr;
    }
    if (refShorthandDefaultPos && refShorthandDefaultPos.start) {
      return expr;
    }

    return this.parseExprOp(expr, startPos, startLoc, -1, noIn);
  }

  // Parse binary operators with the operator precedence parsing
  // algorithm. `left` is the left-hand side of the operator.
  // `minPrec` provides context that allows the function to stop and
  // defer further parser to one of its callers when it encounters an
  // operator that has a lower precedence than the set it is parsing.

  parseExprOp(left, leftStartPos, leftStartLoc, minPrec, noIn) {
    const prec = this.state.type.binop;
    if (prec != null && (!noIn || !this.match((_types || _load_types()).types._in))) {
      if (prec > minPrec) {
        const node = this.startNodeAt(leftStartPos, leftStartLoc);
        node.left = left;
        node.operator = this.state.value;

        if (node.operator === "**" && left.type === "UnaryExpression" && left.extra && !left.extra.parenthesizedArgument && !left.extra.parenthesized) {
          this.raise(left.argument.start, "Illegal expression. Wrap left hand side or entire exponentiation in parentheses.");
        }

        const op = this.state.type;
        this.next();

        const startPos = this.state.start;
        const startLoc = this.state.startLoc;
        node.right = this.parseExprOp(this.parseMaybeUnary(), startPos, startLoc, op.rightAssociative ? prec - 1 : prec, noIn);

        this.finishNode(node, op === (_types || _load_types()).types.logicalOR || op === (_types || _load_types()).types.logicalAND ? "LogicalExpression" : "BinaryExpression");
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, noIn);
      }
    }
    return left;
  }

  // Parse unary operators, both prefix and postfix.

  parseMaybeUnary(refShorthandDefaultPos) {
    if (this.state.type.prefix) {
      const node = this.startNode();
      const update = this.match((_types || _load_types()).types.incDec);
      node.operator = this.state.value;
      node.prefix = true;
      this.next();

      const argType = this.state.type;
      node.argument = this.parseMaybeUnary();

      this.addExtra(node, "parenthesizedArgument", argType === (_types || _load_types()).types.parenL && (!node.argument.extra || !node.argument.extra.parenthesized));

      if (refShorthandDefaultPos && refShorthandDefaultPos.start) {
        this.unexpected(refShorthandDefaultPos.start);
      }

      if (update) {
        this.checkLVal(node.argument, undefined, undefined, "prefix operation");
      } else if (this.state.strict && node.operator === "delete") {
        const arg = node.argument;

        if (arg.type === "Identifier") {
          this.raise(node.start, "Deleting local variable in strict mode");
        } else if (this.hasPlugin("classPrivateProperties") && arg.type === "MemberExpression" && arg.property.type === "PrivateName") {
          this.raise(node.start, "Deleting a private field is not allowed");
        }
      }

      return this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    }

    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    let expr = this.parseExprSubscripts(refShorthandDefaultPos);
    if (refShorthandDefaultPos && refShorthandDefaultPos.start) return expr;
    while (this.state.type.postfix && !this.canInsertSemicolon()) {
      const node = this.startNodeAt(startPos, startLoc);
      node.operator = this.state.value;
      node.prefix = false;
      node.argument = expr;
      this.checkLVal(expr, undefined, undefined, "postfix operation");
      this.next();
      expr = this.finishNode(node, "UpdateExpression");
    }
    return expr;
  }

  // Parse call, dot, and `[]`-subscript expressions.

  parseExprSubscripts(refShorthandDefaultPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const potentialArrowAt = this.state.potentialArrowAt;
    const expr = this.parseExprAtom(refShorthandDefaultPos);

    if (expr.type === "ArrowFunctionExpression" && expr.start === potentialArrowAt) {
      return expr;
    }

    if (refShorthandDefaultPos && refShorthandDefaultPos.start) {
      return expr;
    }

    return this.parseSubscripts(expr, startPos, startLoc);
  }

  parseSubscripts(base, startPos, startLoc, noCalls) {
    const state = { stop: false };
    do {
      base = this.parseSubscript(base, startPos, startLoc, noCalls, state);
    } while (!state.stop);
    return base;
  }

  /** @param state Set 'state.stop = true' to indicate that we should stop parsing subscripts. */
  parseSubscript(base, startPos, startLoc, noCalls, state) {
    if (!noCalls && this.eat((_types || _load_types()).types.doubleColon)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      node.callee = this.parseNoCallExpr();
      state.stop = true;
      return this.parseSubscripts(this.finishNode(node, "BindExpression"), startPos, startLoc, noCalls);
    } else if (this.match((_types || _load_types()).types.questionDot)) {
      this.expectPlugin("optionalChaining");

      if (noCalls && this.lookahead().type == (_types || _load_types()).types.parenL) {
        state.stop = true;
        return base;
      }
      this.next();

      const node = this.startNodeAt(startPos, startLoc);

      if (this.eat((_types || _load_types()).types.bracketL)) {
        node.object = base;
        node.property = this.parseExpression();
        node.computed = true;
        node.optional = true;
        this.expect((_types || _load_types()).types.bracketR);
        return this.finishNode(node, "MemberExpression");
      } else if (this.eat((_types || _load_types()).types.parenL)) {
        const possibleAsync = this.atPossibleAsync(base);

        node.callee = base;
        node.arguments = this.parseCallExpressionArguments((_types || _load_types()).types.parenR, possibleAsync);
        node.optional = true;

        return this.finishNode(node, "CallExpression");
      } else {
        node.object = base;
        node.property = this.parseIdentifier(true);
        node.computed = false;
        node.optional = true;
        return this.finishNode(node, "MemberExpression");
      }
    } else if (this.eat((_types || _load_types()).types.dot)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      node.property = this.hasPlugin("classPrivateProperties") ? this.parseMaybePrivateName() : this.parseIdentifier(true);
      node.computed = false;
      return this.finishNode(node, "MemberExpression");
    } else if (this.eat((_types || _load_types()).types.bracketL)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      node.property = this.parseExpression();
      node.computed = true;
      this.expect((_types || _load_types()).types.bracketR);
      return this.finishNode(node, "MemberExpression");
    } else if (!noCalls && this.match((_types || _load_types()).types.parenL)) {
      const possibleAsync = this.atPossibleAsync(base);
      this.next();

      const node = this.startNodeAt(startPos, startLoc);
      node.callee = base;

      // TODO: Clean up/merge this into `this.state` or a class like acorn's
      // `DestructuringErrors` alongside refShorthandDefaultPos and
      // refNeedsArrowPos.
      const refTrailingCommaPos = { start: -1 };

      node.arguments = this.parseCallExpressionArguments((_types || _load_types()).types.parenR, possibleAsync, refTrailingCommaPos);
      this.finishCallExpression(node);

      if (possibleAsync && this.shouldParseAsyncArrow()) {
        state.stop = true;

        if (refTrailingCommaPos.start > -1) {
          this.raise(refTrailingCommaPos.start, "A trailing comma is not permitted after the rest element");
        }

        return this.parseAsyncArrowFromCallExpression(this.startNodeAt(startPos, startLoc), node);
      } else {
        this.toReferencedList(node.arguments);
      }
      return node;
    } else if (this.match((_types || _load_types()).types.backQuote)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.tag = base;
      node.quasi = this.parseTemplate(true);
      return this.finishNode(node, "TaggedTemplateExpression");
    } else {
      state.stop = true;
      return base;
    }
  }

  atPossibleAsync(base) {
    return this.state.potentialArrowAt === base.start && base.type === "Identifier" && base.name === "async" && !this.canInsertSemicolon();
  }

  finishCallExpression(node) {
    if (node.callee.type === "Import") {
      if (node.arguments.length !== 1) {
        this.raise(node.start, "import() requires exactly one argument");
      }

      const importArg = node.arguments[0];
      if (importArg && importArg.type === "SpreadElement") {
        this.raise(importArg.start, "... is not allowed in import()");
      }
    }
    return this.finishNode(node, "CallExpression");
  }

  parseCallExpressionArguments(close, possibleAsyncArrow, refTrailingCommaPos) {
    const elts = [];
    let innerParenStart;
    let first = true;

    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect((_types || _load_types()).types.comma);
        if (this.eat(close)) break;
      }

      // we need to make sure that if this is an async arrow functions, that we don't allow inner parens inside the params
      if (this.match((_types || _load_types()).types.parenL) && !innerParenStart) {
        innerParenStart = this.state.start;
      }

      elts.push(this.parseExprListItem(false, possibleAsyncArrow ? { start: 0 } : undefined, possibleAsyncArrow ? { start: 0 } : undefined, possibleAsyncArrow ? refTrailingCommaPos : undefined));
    }

    // we found an async arrow function so let's not allow any inner parens
    if (possibleAsyncArrow && innerParenStart && this.shouldParseAsyncArrow()) {
      this.unexpected();
    }

    return elts;
  }

  shouldParseAsyncArrow() {
    return this.match((_types || _load_types()).types.arrow);
  }

  parseAsyncArrowFromCallExpression(node, call) {
    this.expect((_types || _load_types()).types.arrow);
    return this.parseArrowExpression(node, call.arguments, true);
  }

  // Parse a no-call expression (like argument of `new` or `::` operators).

  parseNoCallExpr() {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    return this.parseSubscripts(this.parseExprAtom(), startPos, startLoc, true);
  }

  // Parse an atomic expression — either a single token that is an
  // expression, an expression started by a keyword like `function` or
  // `new`, or an expression wrapped in punctuation like `()`, `[]`,
  // or `{}`.

  parseExprAtom(refShorthandDefaultPos) {
    const canBeArrow = this.state.potentialArrowAt === this.state.start;
    let node;

    switch (this.state.type) {
      case (_types || _load_types()).types._super:
        if (!this.state.inMethod && !this.state.inClassProperty && !this.options.allowSuperOutsideMethod) {
          this.raise(this.state.start, "'super' outside of function or class");
        }

        node = this.startNode();
        this.next();
        if (!this.match((_types || _load_types()).types.parenL) && !this.match((_types || _load_types()).types.bracketL) && !this.match((_types || _load_types()).types.dot)) {
          this.unexpected();
        }
        if (this.match((_types || _load_types()).types.parenL) && this.state.inMethod !== "constructor" && !this.options.allowSuperOutsideMethod) {
          this.raise(node.start, "super() is only valid inside a class constructor. Make sure the method name is spelled exactly as 'constructor'.");
        }
        return this.finishNode(node, "Super");

      case (_types || _load_types()).types._import:
        if (this.lookahead().type === (_types || _load_types()).types.dot) {
          return this.parseImportMetaProperty();
        }

        this.expectPlugin("dynamicImport");

        node = this.startNode();
        this.next();
        if (!this.match((_types || _load_types()).types.parenL)) {
          this.unexpected(null, (_types || _load_types()).types.parenL);
        }
        return this.finishNode(node, "Import");

      case (_types || _load_types()).types._this:
        node = this.startNode();
        this.next();
        return this.finishNode(node, "ThisExpression");

      case (_types || _load_types()).types._yield:
        if (this.state.inGenerator) this.unexpected();

      case (_types || _load_types()).types.name:
        {
          node = this.startNode();
          const allowAwait = this.state.value === "await" && this.state.inAsync;
          const allowYield = this.shouldAllowYieldIdentifier();
          const id = this.parseIdentifier(allowAwait || allowYield);

          if (id.name === "await") {
            if (this.state.inAsync || this.inModule) {
              return this.parseAwait(node);
            }
          } else if (id.name === "async" && this.match((_types || _load_types()).types._function) && !this.canInsertSemicolon()) {
            this.next();
            return this.parseFunction(node, false, false, true);
          } else if (canBeArrow && id.name === "async" && this.match((_types || _load_types()).types.name)) {
            const params = [this.parseIdentifier()];
            this.expect((_types || _load_types()).types.arrow);
            // let foo = bar => {};
            return this.parseArrowExpression(node, params, true);
          }

          if (canBeArrow && !this.canInsertSemicolon() && this.eat((_types || _load_types()).types.arrow)) {
            return this.parseArrowExpression(node, [id]);
          }

          return id;
        }

      case (_types || _load_types()).types._do:
        {
          this.expectPlugin("doExpressions");
          const node = this.startNode();
          this.next();
          const oldInFunction = this.state.inFunction;
          const oldLabels = this.state.labels;
          this.state.labels = [];
          this.state.inFunction = false;
          node.body = this.parseBlock(false);
          this.state.inFunction = oldInFunction;
          this.state.labels = oldLabels;
          return this.finishNode(node, "DoExpression");
        }

      case (_types || _load_types()).types.regexp:
        {
          const value = this.state.value;
          node = this.parseLiteral(value.value, "RegExpLiteral");
          node.pattern = value.pattern;
          node.flags = value.flags;
          return node;
        }

      case (_types || _load_types()).types.num:
        return this.parseLiteral(this.state.value, "NumericLiteral");

      case (_types || _load_types()).types.bigint:
        return this.parseLiteral(this.state.value, "BigIntLiteral");

      case (_types || _load_types()).types.string:
        return this.parseLiteral(this.state.value, "StringLiteral");

      case (_types || _load_types()).types._null:
        node = this.startNode();
        this.next();
        return this.finishNode(node, "NullLiteral");

      case (_types || _load_types()).types._true:
      case (_types || _load_types()).types._false:
        return this.parseBooleanLiteral();

      case (_types || _load_types()).types.parenL:
        return this.parseParenAndDistinguishExpression(canBeArrow);

      case (_types || _load_types()).types.bracketL:
        node = this.startNode();
        this.next();
        node.elements = this.parseExprList((_types || _load_types()).types.bracketR, true, refShorthandDefaultPos);
        this.toReferencedList(node.elements);
        return this.finishNode(node, "ArrayExpression");

      case (_types || _load_types()).types.braceL:
        return this.parseObj(false, refShorthandDefaultPos);

      case (_types || _load_types()).types._function:
        return this.parseFunctionExpression();

      case (_types || _load_types()).types.at:
        this.parseDecorators();

      case (_types || _load_types()).types._class:
        node = this.startNode();
        this.takeDecorators(node);
        return this.parseClass(node, false);

      case (_types || _load_types()).types._new:
        return this.parseNew();

      case (_types || _load_types()).types.backQuote:
        return this.parseTemplate(false);

      case (_types || _load_types()).types.doubleColon:
        {
          node = this.startNode();
          this.next();
          node.object = null;
          const callee = node.callee = this.parseNoCallExpr();
          if (callee.type === "MemberExpression") {
            return this.finishNode(node, "BindExpression");
          } else {
            throw this.raise(callee.start, "Binding should be performed on object property.");
          }
        }

      default:
        throw this.unexpected();
    }
  }

  parseBooleanLiteral() {
    const node = this.startNode();
    node.value = this.match((_types || _load_types()).types._true);
    this.next();
    return this.finishNode(node, "BooleanLiteral");
  }

  parseMaybePrivateName() {
    const isPrivate = this.eat((_types || _load_types()).types.hash);

    if (isPrivate) {
      const node = this.startNode();
      node.id = this.parseIdentifier(true);
      return this.finishNode(node, "PrivateName");
    } else {
      return this.parseIdentifier(true);
    }
  }

  parseFunctionExpression() {
    const node = this.startNode();
    const meta = this.parseIdentifier(true);
    if (this.state.inGenerator && this.eat((_types || _load_types()).types.dot)) {
      return this.parseMetaProperty(node, meta, "sent");
    }
    return this.parseFunction(node, false);
  }

  parseMetaProperty(node, meta, propertyName) {
    node.meta = meta;

    if (meta.name === "function" && propertyName === "sent") {
      if (this.isContextual(propertyName)) {
        this.expectPlugin("functionSent");
      } else if (!this.hasPlugin("functionSent")) {
        // They didn't actually say `function.sent`, just `function.`, so a simple error would be less confusing.
        this.unexpected();
      }
    }

    node.property = this.parseIdentifier(true);

    if (node.property.name !== propertyName) {
      this.raise(node.property.start, `The only valid meta property for ${meta.name} is ${meta.name}.${propertyName}`);
    }

    return this.finishNode(node, "MetaProperty");
  }

  parseImportMetaProperty() {
    const node = this.startNode();
    const id = this.parseIdentifier(true);
    this.expect((_types || _load_types()).types.dot);

    if (id.name === "import") {
      if (this.isContextual("meta")) {
        this.expectPlugin("importMeta");
      } else if (!this.hasPlugin("importMeta")) {
        this.raise(id.start, `Dynamic imports require a parameter: import('a.js').then`);
      }
    }

    if (!this.inModule) {
      this.raise(id.start, `import.meta may appear only with 'sourceType: "module"'`);
    }
    return this.parseMetaProperty(node, id, "meta");
  }

  parseLiteral(value, type, startPos, startLoc) {
    startPos = startPos || this.state.start;
    startLoc = startLoc || this.state.startLoc;

    const node = this.startNodeAt(startPos, startLoc);
    this.addExtra(node, "rawValue", value);
    this.addExtra(node, "raw", this.input.slice(startPos, this.state.end));
    node.value = value;
    this.next();
    return this.finishNode(node, type);
  }

  parseParenExpression() {
    this.expect((_types || _load_types()).types.parenL);
    const val = this.parseExpression();
    this.expect((_types || _load_types()).types.parenR);
    return val;
  }

  parseParenAndDistinguishExpression(canBeArrow) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;

    let val;
    this.expect((_types || _load_types()).types.parenL);

    const innerStartPos = this.state.start;
    const innerStartLoc = this.state.startLoc;
    const exprList = [];
    const refShorthandDefaultPos = { start: 0 };
    const refNeedsArrowPos = { start: 0 };
    let first = true;
    let spreadStart;
    let optionalCommaStart;

    while (!this.match((_types || _load_types()).types.parenR)) {
      if (first) {
        first = false;
      } else {
        this.expect((_types || _load_types()).types.comma, refNeedsArrowPos.start || null);
        if (this.match((_types || _load_types()).types.parenR)) {
          optionalCommaStart = this.state.start;
          break;
        }
      }

      if (this.match((_types || _load_types()).types.ellipsis)) {
        const spreadNodeStartPos = this.state.start;
        const spreadNodeStartLoc = this.state.startLoc;
        spreadStart = this.state.start;
        exprList.push(this.parseParenItem(this.parseRest(), spreadNodeStartPos, spreadNodeStartLoc));

        if (this.match((_types || _load_types()).types.comma) && this.lookahead().type === (_types || _load_types()).types.parenR) {
          this.raise(this.state.start, "A trailing comma is not permitted after the rest element");
        }

        break;
      } else {
        exprList.push(this.parseMaybeAssign(false, refShorthandDefaultPos, this.parseParenItem, refNeedsArrowPos));
      }
    }

    const innerEndPos = this.state.start;
    const innerEndLoc = this.state.startLoc;
    this.expect((_types || _load_types()).types.parenR);

    let arrowNode = this.startNodeAt(startPos, startLoc);
    if (canBeArrow && this.shouldParseArrow() && (arrowNode = this.parseArrow(arrowNode))) {
      for (const param of exprList) {
        if (param.extra && param.extra.parenthesized) this.unexpected(param.extra.parenStart);
      }

      return this.parseArrowExpression(arrowNode, exprList);
    }

    if (!exprList.length) {
      this.unexpected(this.state.lastTokStart);
    }
    if (optionalCommaStart) this.unexpected(optionalCommaStart);
    if (spreadStart) this.unexpected(spreadStart);
    if (refShorthandDefaultPos.start) this.unexpected(refShorthandDefaultPos.start);
    if (refNeedsArrowPos.start) this.unexpected(refNeedsArrowPos.start);

    if (exprList.length > 1) {
      val = this.startNodeAt(innerStartPos, innerStartLoc);
      val.expressions = exprList;
      this.toReferencedList(val.expressions);
      this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
    } else {
      val = exprList[0];
    }

    this.addExtra(val, "parenthesized", true);
    this.addExtra(val, "parenStart", startPos);

    return val;
  }

  shouldParseArrow() {
    return !this.canInsertSemicolon();
  }

  parseArrow(node) {
    if (this.eat((_types || _load_types()).types.arrow)) {
      return node;
    }
  }

  parseParenItem(node, startPos,
  // eslint-disable-next-line no-unused-vars
  startLoc) {
    return node;
  }

  // New's precedence is slightly tricky. It must allow its argument to
  // be a `[]` or dot subscript expression, but not a call — at least,
  // not without wrapping it in parentheses. Thus, it uses the noCalls
  // argument to parseSubscripts to prevent it from consuming the
  // argument list.

  parseNew() {
    const node = this.startNode();
    const meta = this.parseIdentifier(true);

    if (this.eat((_types || _load_types()).types.dot)) {
      const metaProp = this.parseMetaProperty(node, meta, "target");

      if (!this.state.inFunction) {
        this.raise(metaProp.property.start, "new.target can only be used in functions");
      }

      return metaProp;
    }

    node.callee = this.parseNoCallExpr();
    if (this.eat((_types || _load_types()).types.questionDot)) node.optional = true;
    this.parseNewArguments(node);
    return this.finishNode(node, "NewExpression");
  }

  parseNewArguments(node) {
    if (this.eat((_types || _load_types()).types.parenL)) {
      const args = this.parseExprList((_types || _load_types()).types.parenR);
      this.toReferencedList(args);
      // $FlowFixMe (parseExprList should be all non-null in this case)
      node.arguments = args;
    } else {
      node.arguments = [];
    }
  }

  // Parse template expression.

  parseTemplateElement(isTagged) {
    const elem = this.startNode();
    if (this.state.value === null) {
      if (!isTagged) {
        // TODO: fix this
        this.raise(this.state.invalidTemplateEscapePosition || 0, "Invalid escape sequence in template");
      } else {
        this.state.invalidTemplateEscapePosition = null;
      }
    }
    elem.value = {
      raw: this.input.slice(this.state.start, this.state.end).replace(/\r\n?/g, "\n"),
      cooked: this.state.value
    };
    this.next();
    elem.tail = this.match((_types || _load_types()).types.backQuote);
    return this.finishNode(elem, "TemplateElement");
  }

  parseTemplate(isTagged) {
    const node = this.startNode();
    this.next();
    node.expressions = [];
    let curElt = this.parseTemplateElement(isTagged);
    node.quasis = [curElt];
    while (!curElt.tail) {
      this.expect((_types || _load_types()).types.dollarBraceL);
      node.expressions.push(this.parseExpression());
      this.expect((_types || _load_types()).types.braceR);
      node.quasis.push(curElt = this.parseTemplateElement(isTagged));
    }
    this.next();
    return this.finishNode(node, "TemplateLiteral");
  }

  // Parse an object literal or binding pattern.

  parseObj(isPattern, refShorthandDefaultPos) {
    let decorators = [];
    const propHash = (0, (_create || _load_create()).default)(null);
    let first = true;
    const node = this.startNode();

    node.properties = [];
    this.next();

    let firstRestLocation = null;

    while (!this.eat((_types || _load_types()).types.braceR)) {
      if (first) {
        first = false;
      } else {
        this.expect((_types || _load_types()).types.comma);
        if (this.eat((_types || _load_types()).types.braceR)) break;
      }

      if (this.match((_types || _load_types()).types.at)) {
        if (this.hasPlugin("decorators2")) {
          this.raise(this.state.start, "Stage 2 decorators disallow object literal property decorators");
        } else {
          // we needn't check if decorators (stage 0) plugin is enabled since it's checked by
          // the call to this.parseDecorator
          while (this.match((_types || _load_types()).types.at)) {
            decorators.push(this.parseDecorator());
          }
        }
      }

      let prop = this.startNode(),
          isGenerator = false,
          isAsync = false,
          startPos,
          startLoc;
      if (decorators.length) {
        prop.decorators = decorators;
        decorators = [];
      }

      if (this.match((_types || _load_types()).types.ellipsis)) {
        this.expectPlugin("objectRestSpread");
        prop = this.parseSpread(isPattern ? { start: 0 } : undefined);
        if (isPattern) {
          this.toAssignable(prop, true, "object pattern");
        }
        node.properties.push(prop);
        if (isPattern) {
          const position = this.state.start;
          if (firstRestLocation !== null) {
            this.unexpected(firstRestLocation, "Cannot have multiple rest elements when destructuring");
          } else if (this.eat((_types || _load_types()).types.braceR)) {
            break;
          } else if (this.match((_types || _load_types()).types.comma) && this.lookahead().type === (_types || _load_types()).types.braceR) {
            this.unexpected(position, "A trailing comma is not permitted after the rest element");
          } else {
            firstRestLocation = position;
            continue;
          }
        } else {
          continue;
        }
      }

      prop.method = false;

      if (isPattern || refShorthandDefaultPos) {
        startPos = this.state.start;
        startLoc = this.state.startLoc;
      }

      if (!isPattern) {
        isGenerator = this.eat((_types || _load_types()).types.star);
      }

      if (!isPattern && this.isContextual("async")) {
        if (isGenerator) this.unexpected();

        const asyncId = this.parseIdentifier();
        if (this.match((_types || _load_types()).types.colon) || this.match((_types || _load_types()).types.parenL) || this.match((_types || _load_types()).types.braceR) || this.match((_types || _load_types()).types.eq) || this.match((_types || _load_types()).types.comma)) {
          prop.key = asyncId;
          prop.computed = false;
        } else {
          isAsync = true;
          if (this.match((_types || _load_types()).types.star)) {
            this.expectPlugin("asyncGenerators");
            this.next();
            isGenerator = true;
          }
          this.parsePropertyName(prop);
        }
      } else {
        this.parsePropertyName(prop);
      }

      this.parseObjPropValue(prop, startPos, startLoc, isGenerator, isAsync, isPattern, refShorthandDefaultPos);
      this.checkPropClash(prop, propHash);

      if (prop.shorthand) {
        this.addExtra(prop, "shorthand", true);
      }

      node.properties.push(prop);
    }

    if (firstRestLocation !== null) {
      this.unexpected(firstRestLocation, "The rest element has to be the last element when destructuring");
    }

    if (decorators.length) {
      this.raise(this.state.start, "You have trailing decorators with no property");
    }

    return this.finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression");
  }

  isGetterOrSetterMethod(prop, isPattern) {
    return !isPattern && !prop.computed && prop.key.type === "Identifier" && (prop.key.name === "get" || prop.key.name === "set") && (this.match((_types || _load_types()).types.string) || // get "string"() {}
    this.match((_types || _load_types()).types.num) || // get 1() {}
    this.match((_types || _load_types()).types.bracketL) || // get ["string"]() {}
    this.match((_types || _load_types()).types.name) || // get foo() {}
    !!this.state.type.keyword) // get debugger() {}
    ;
  }

  // get methods aren't allowed to have any parameters
  // set methods must have exactly 1 parameter
  checkGetterSetterParamCount(method) {
    const paramCount = method.kind === "get" ? 0 : 1;
    if (method.params.length !== paramCount) {
      const start = method.start;
      if (method.kind === "get") {
        this.raise(start, "getter should have no params");
      } else {
        this.raise(start, "setter should have exactly one param");
      }
    }
  }

  parseObjectMethod(prop, isGenerator, isAsync, isPattern) {
    if (isAsync || isGenerator || this.match((_types || _load_types()).types.parenL)) {
      if (isPattern) this.unexpected();
      prop.kind = "method";
      prop.method = true;
      return this.parseMethod(prop, isGenerator, isAsync,
      /* isConstructor */false, "ObjectMethod");
    }

    if (this.isGetterOrSetterMethod(prop, isPattern)) {
      if (isGenerator || isAsync) this.unexpected();
      prop.kind = prop.key.name;
      this.parsePropertyName(prop);
      this.parseMethod(prop,
      /* isGenerator */false,
      /* isAsync */false,
      /* isConstructor */false, "ObjectMethod");
      this.checkGetterSetterParamCount(prop);
      return prop;
    }
  }

  parseObjectProperty(prop, startPos, startLoc, isPattern, refShorthandDefaultPos) {
    prop.shorthand = false;

    if (this.eat((_types || _load_types()).types.colon)) {
      prop.value = isPattern ? this.parseMaybeDefault(this.state.start, this.state.startLoc) : this.parseMaybeAssign(false, refShorthandDefaultPos);

      return this.finishNode(prop, "ObjectProperty");
    }

    if (!prop.computed && prop.key.type === "Identifier") {
      this.checkReservedWord(prop.key.name, prop.key.start, true, true);

      if (isPattern) {
        prop.value = this.parseMaybeDefault(startPos, startLoc, prop.key.__clone());
      } else if (this.match((_types || _load_types()).types.eq) && refShorthandDefaultPos) {
        if (!refShorthandDefaultPos.start) {
          refShorthandDefaultPos.start = this.state.start;
        }
        prop.value = this.parseMaybeDefault(startPos, startLoc, prop.key.__clone());
      } else {
        prop.value = prop.key.__clone();
      }
      prop.shorthand = true;

      return this.finishNode(prop, "ObjectProperty");
    }
  }

  parseObjPropValue(prop, startPos, startLoc, isGenerator, isAsync, isPattern, refShorthandDefaultPos) {
    const node = this.parseObjectMethod(prop, isGenerator, isAsync, isPattern) || this.parseObjectProperty(prop, startPos, startLoc, isPattern, refShorthandDefaultPos);

    if (!node) this.unexpected();

    // $FlowFixMe
    return node;
  }

  parsePropertyName(prop) {
    if (this.eat((_types || _load_types()).types.bracketL)) {
      prop.computed = true;
      prop.key = this.parseMaybeAssign();
      this.expect((_types || _load_types()).types.bracketR);
    } else {
      prop.computed = false;
      const oldInPropertyName = this.state.inPropertyName;
      this.state.inPropertyName = true;
      prop.key = this.match((_types || _load_types()).types.num) || this.match((_types || _load_types()).types.string) ? this.parseExprAtom() : this.parseIdentifier(true);
      this.state.inPropertyName = oldInPropertyName;
    }

    return prop.key;
  }

  // Initialize empty function node.

  initFunction(node, isAsync) {
    node.id = null;
    node.generator = false;
    node.expression = false;
    node.async = !!isAsync;
  }

  // Parse object or class method.

  parseMethod(node, isGenerator, isAsync, isConstructor, type) {
    const oldInMethod = this.state.inMethod;
    this.state.inMethod = node.kind || true;
    this.initFunction(node, isAsync);
    this.expect((_types || _load_types()).types.parenL);
    const allowModifiers = isConstructor; // For TypeScript parameter properties
    node.params = this.parseBindingList((_types || _load_types()).types.parenR,
    /* allowEmpty */false, allowModifiers);
    node.generator = !!isGenerator;
    this.parseFunctionBodyAndFinish(node, type);
    this.state.inMethod = oldInMethod;
    return node;
  }

  // Parse arrow function expression with given parameters.

  parseArrowExpression(node, params, isAsync) {
    this.initFunction(node, isAsync);
    node.params = this.toAssignableList(params, true, "arrow function parameters");
    this.parseFunctionBody(node, true);
    return this.finishNode(node, "ArrowFunctionExpression");
  }

  isStrictBody(node, isExpression) {
    if (!isExpression && node.body.directives.length) {
      for (const directive of node.body.directives) {
        if (directive.value.value === "use strict") {
          return true;
        }
      }
    }

    return false;
  }

  parseFunctionBodyAndFinish(node, type, allowExpressionBody) {
    // $FlowIgnore (node is not bodiless if we get here)
    this.parseFunctionBody(node, allowExpressionBody);
    this.finishNode(node, type);
  }

  // Parse function body and check parameters.
  parseFunctionBody(node, allowExpression) {
    const isExpression = allowExpression && !this.match((_types || _load_types()).types.braceL);

    const oldInAsync = this.state.inAsync;
    this.state.inAsync = node.async;
    if (isExpression) {
      node.body = this.parseMaybeAssign();
      node.expression = true;
    } else {
      // Start a new scope with regard to labels and the `inFunction`
      // flag (restore them to their old value afterwards).
      const oldInFunc = this.state.inFunction;
      const oldInGen = this.state.inGenerator;
      const oldLabels = this.state.labels;
      this.state.inFunction = true;
      this.state.inGenerator = node.generator;
      this.state.labels = [];
      node.body = this.parseBlock(true);
      node.expression = false;
      this.state.inFunction = oldInFunc;
      this.state.inGenerator = oldInGen;
      this.state.labels = oldLabels;
    }
    this.state.inAsync = oldInAsync;

    // If this is a strict mode function, verify that argument names
    // are not repeated, and it does not try to bind the words `eval`
    // or `arguments`.
    const isStrict = this.isStrictBody(node, isExpression);
    // Also check when allowExpression === true for arrow functions
    const checkLVal = this.state.strict || allowExpression || isStrict;

    if (isStrict && node.id && node.id.type === "Identifier" && node.id.name === "yield") {
      this.raise(node.id.start, "Binding yield in strict mode");
    }

    if (checkLVal) {
      const nameHash = (0, (_create || _load_create()).default)(null);
      const oldStrict = this.state.strict;
      if (isStrict) this.state.strict = true;
      if (node.id) {
        this.checkLVal(node.id, true, undefined, "function name");
      }
      for (const param of node.params) {
        if (isStrict && param.type !== "Identifier") {
          this.raise(param.start, "Non-simple parameter in strict mode");
        }
        this.checkLVal(param, true, nameHash, "function parameter list");
      }
      this.state.strict = oldStrict;
    }
  }

  // Parses a comma-separated list of expressions, and returns them as
  // an array. `close` is the token type that ends the list, and
  // `allowEmpty` can be turned on to allow subsequent commas with
  // nothing in between them to be parsed as `null` (which is needed
  // for array literals).

  parseExprList(close, allowEmpty, refShorthandDefaultPos) {
    const elts = [];
    let first = true;

    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect((_types || _load_types()).types.comma);
        if (this.eat(close)) break;
      }

      elts.push(this.parseExprListItem(allowEmpty, refShorthandDefaultPos));
    }
    return elts;
  }

  parseExprListItem(allowEmpty, refShorthandDefaultPos, refNeedsArrowPos, refTrailingCommaPos) {
    let elt;
    if (allowEmpty && this.match((_types || _load_types()).types.comma)) {
      elt = null;
    } else if (this.match((_types || _load_types()).types.ellipsis)) {
      elt = this.parseSpread(refShorthandDefaultPos);

      if (refTrailingCommaPos && this.match((_types || _load_types()).types.comma)) {
        refTrailingCommaPos.start = this.state.start;
      }
    } else {
      elt = this.parseMaybeAssign(false, refShorthandDefaultPos, this.parseParenItem, refNeedsArrowPos);
    }
    return elt;
  }

  // Parse the next token as an identifier. If `liberal` is true (used
  // when parsing properties), it will also convert keywords into
  // identifiers.

  parseIdentifier(liberal) {
    const node = this.startNode();
    const name = this.parseIdentifierName(node.start, liberal);
    node.name = name;
    node.loc.identifierName = name;
    return this.finishNode(node, "Identifier");
  }

  parseIdentifierName(pos, liberal) {
    if (!liberal) {
      this.checkReservedWord(this.state.value, this.state.start, !!this.state.type.keyword, false);
    }

    let name;

    if (this.match((_types || _load_types()).types.name)) {
      name = this.state.value;
    } else if (this.state.type.keyword) {
      name = this.state.type.keyword;
    } else {
      throw this.unexpected();
    }

    if (!liberal && name === "await" && this.state.inAsync) {
      this.raise(pos, "invalid use of await inside of an async function");
    }

    this.next();
    return name;
  }

  checkReservedWord(word, startLoc, checkKeywords, isBinding) {
    if (this.isReservedWord(word) || checkKeywords && this.isKeyword(word)) {
      this.raise(startLoc, word + " is a reserved word");
    }

    if (this.state.strict && ((_identifier || _load_identifier()).reservedWords.strict(word) || isBinding && (_identifier || _load_identifier()).reservedWords.strictBind(word))) {
      this.raise(startLoc, word + " is a reserved word in strict mode");
    }
  }

  // Parses await expression inside async function.

  parseAwait(node) {
    // istanbul ignore next: this condition is checked at the call site so won't be hit here
    if (!this.state.inAsync) {
      this.unexpected();
    }
    if (this.match((_types || _load_types()).types.star)) {
      this.raise(node.start, "await* has been removed from the async functions proposal. Use Promise.all() instead.");
    }
    node.argument = this.parseMaybeUnary();
    return this.finishNode(node, "AwaitExpression");
  }

  // Parses yield expression inside generator.

  parseYield() {
    const node = this.startNode();
    this.next();
    if (this.match((_types || _load_types()).types.semi) || this.canInsertSemicolon() || !this.match((_types || _load_types()).types.star) && !this.state.type.startsExpr) {
      node.delegate = false;
      node.argument = null;
    } else {
      node.delegate = this.eat((_types || _load_types()).types.star);
      node.argument = this.parseMaybeAssign();
    }
    return this.finishNode(node, "YieldExpression");
  }
}
exports.default = ExpressionParser;
module.exports = exports["default"];