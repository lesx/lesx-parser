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
  return _types = _interopRequireWildcard(require("../types"));
}

var _types2;

function _load_types2() {
  return _types2 = require("../tokenizer/types");
}

var _expression;

function _load_expression() {
  return _expression = _interopRequireDefault(require("./expression"));
}

var _whitespace;

function _load_whitespace() {
  return _whitespace = require("../util/whitespace");
}

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Reused empty array added for node fields that are always empty.

/* eslint max-len: 0 */

const empty = [];

const loopLabel = { kind: "loop" },
      switchLabel = { kind: "switch" };

class StatementParser extends (_expression || _load_expression()).default {
  // ### Statement parsing

  // Parse a program. Initializes the parser, reads any number of
  // statements, and wraps them in a Program node.  Optionally takes a
  // `program` argument.  If present, the statements will be appended
  // to its body instead of creating a new node.

  parseTopLevel(file, program) {
    program.sourceType = this.options.sourceType;

    this.parseBlockBody(program, true, true, (_types2 || _load_types2()).types.eof);

    file.program = this.finishNode(program, "Program");
    file.comments = this.state.comments;

    if (this.options.tokens) file.tokens = this.state.tokens;

    return this.finishNode(file, "File");
  }

  // TODO

  stmtToDirective(stmt) {
    const expr = stmt.expression;

    const directiveLiteral = this.startNodeAt(expr.start, expr.loc.start);
    const directive = this.startNodeAt(stmt.start, stmt.loc.start);

    const raw = this.input.slice(expr.start, expr.end);
    const val = directiveLiteral.value = raw.slice(1, -1); // remove quotes

    this.addExtra(directiveLiteral, "raw", raw);
    this.addExtra(directiveLiteral, "rawValue", val);

    directive.value = this.finishNodeAt(directiveLiteral, "DirectiveLiteral", expr.end, expr.loc.end);

    return this.finishNodeAt(directive, "Directive", stmt.end, stmt.loc.end);
  }

  // Parse a single statement.
  //
  // If expecting a statement and finding a slash operator, parse a
  // regular expression literal. This is to handle cases like
  // `if (foo) /blah/.exec(foo)`, where looking at the previous token
  // does not help.

  parseStatement(declaration, topLevel) {
    if (this.match((_types2 || _load_types2()).types.at)) {
      this.parseDecorators(true);
    }
    return this.parseStatementContent(declaration, topLevel);
  }

  parseStatementContent(declaration, topLevel) {
    const starttype = this.state.type;
    const node = this.startNode();

    // Most types of statements are recognized by the keyword they
    // start with. Many are trivial to parse, some require a bit of
    // complexity.

    switch (starttype) {
      case (_types2 || _load_types2()).types._break:
      case (_types2 || _load_types2()).types._continue:
        // $FlowFixMe
        return this.parseBreakContinueStatement(node, starttype.keyword);
      case (_types2 || _load_types2()).types._debugger:
        return this.parseDebuggerStatement(node);
      case (_types2 || _load_types2()).types._do:
        return this.parseDoStatement(node);
      case (_types2 || _load_types2()).types._for:
        return this.parseForStatement(node);
      case (_types2 || _load_types2()).types._function:
        if (this.lookahead().type === (_types2 || _load_types2()).types.dot) break;
        if (!declaration) this.unexpected();
        return this.parseFunctionStatement(node);

      case (_types2 || _load_types2()).types._class:
        if (!declaration) this.unexpected();
        return this.parseClass(node, true);

      case (_types2 || _load_types2()).types._if:
        return this.parseIfStatement(node);
      case (_types2 || _load_types2()).types._return:
        return this.parseReturnStatement(node);
      case (_types2 || _load_types2()).types._switch:
        return this.parseSwitchStatement(node);
      case (_types2 || _load_types2()).types._throw:
        return this.parseThrowStatement(node);
      case (_types2 || _load_types2()).types._try:
        return this.parseTryStatement(node);

      case (_types2 || _load_types2()).types._let:
      case (_types2 || _load_types2()).types._const:
        if (!declaration) this.unexpected(); // NOTE: falls through to _var

      case (_types2 || _load_types2()).types._var:
        return this.parseVarStatement(node, starttype);

      case (_types2 || _load_types2()).types._while:
        return this.parseWhileStatement(node);
      case (_types2 || _load_types2()).types._with:
        return this.parseWithStatement(node);
      case (_types2 || _load_types2()).types.braceL:
        return this.parseBlock();
      case (_types2 || _load_types2()).types.semi:
        return this.parseEmptyStatement(node);
      case (_types2 || _load_types2()).types._export:
      case (_types2 || _load_types2()).types._import:
        if (this.hasPlugin("dynamicImport") && this.lookahead().type === (_types2 || _load_types2()).types.parenL || this.hasPlugin("importMeta") && this.lookahead().type === (_types2 || _load_types2()).types.dot) break;

        if (!this.options.allowImportExportEverywhere) {
          if (!topLevel) {
            this.raise(this.state.start, "'import' and 'export' may only appear at the top level");
          }

          if (!this.inModule) {
            this.raise(this.state.start, `'import' and 'export' may appear only with 'sourceType: "module"'`);
          }
        }

        this.next();
        if (starttype == (_types2 || _load_types2()).types._import) {
          return this.parseImport(node);
        } else {
          return this.parseExport(node);
        }

      case (_types2 || _load_types2()).types.name:
        if (this.state.value === "async") {
          // peek ahead and see if next token is a function
          const state = this.state.clone();
          this.next();
          if (this.match((_types2 || _load_types2()).types._function) && !this.canInsertSemicolon()) {
            this.expect((_types2 || _load_types2()).types._function);
            return this.parseFunction(node, true, false, true);
          } else {
            this.state = state;
          }
        }
    }

    // If the statement does not start with a statement keyword or a
    // brace, it's an ExpressionStatement or LabeledStatement. We
    // simply start parsing an expression, and afterwards, if the
    // next token is a colon and the expression was a simple
    // Identifier node, we switch to interpreting it as a label.
    const maybeName = this.state.value;
    const expr = this.parseExpression();

    if (starttype === (_types2 || _load_types2()).types.name && expr.type === "Identifier" && this.eat((_types2 || _load_types2()).types.colon)) {
      return this.parseLabeledStatement(node, maybeName, expr);
    } else {
      return this.parseExpressionStatement(node, expr);
    }
  }

  takeDecorators(node) {
    const decorators = this.state.decoratorStack[this.state.decoratorStack.length - 1];
    if (decorators.length) {
      node.decorators = decorators;
      this.resetStartLocationFromNode(node, decorators[0]);
      this.state.decoratorStack[this.state.decoratorStack.length - 1] = [];
    }
  }

  parseDecorators(allowExport) {
    if (this.hasPlugin("decorators2")) {
      allowExport = false;
    }

    const currentContextDecorators = this.state.decoratorStack[this.state.decoratorStack.length - 1];
    while (this.match((_types2 || _load_types2()).types.at)) {
      const decorator = this.parseDecorator();
      currentContextDecorators.push(decorator);
    }

    if (this.match((_types2 || _load_types2()).types._export)) {
      if (allowExport) {
        return;
      } else {
        this.raise(this.state.start, "Using the export keyword between a decorator and a class is not allowed. Please use `export @dec class` instead");
      }
    }

    if (!this.match((_types2 || _load_types2()).types._class)) {
      this.raise(this.state.start, "Leading decorators must be attached to a class declaration");
    }
  }

  parseDecorator() {
    this.expectOnePlugin(["decorators", "decorators2"]);

    const node = this.startNode();
    this.next();

    if (this.hasPlugin("decorators2")) {
      const startPos = this.state.start;
      const startLoc = this.state.startLoc;
      let expr = this.parseIdentifier(false);

      while (this.eat((_types2 || _load_types2()).types.dot)) {
        const node = this.startNodeAt(startPos, startLoc);
        node.object = expr;
        node.property = this.parseIdentifier(true);
        node.computed = false;
        expr = this.finishNode(node, "MemberExpression");
      }

      if (this.eat((_types2 || _load_types2()).types.parenL)) {
        const node = this.startNodeAt(startPos, startLoc);
        node.callee = expr;
        // Every time a decorator class expression is evaluated, a new empty array is pushed onto the stack
        // So that the decorators of any nested class expressions will be dealt with separately
        this.state.decoratorStack.push([]);
        node.arguments = this.parseCallExpressionArguments((_types2 || _load_types2()).types.parenR, false);
        this.state.decoratorStack.pop();
        expr = this.finishNode(node, "CallExpression");
        this.toReferencedList(expr.arguments);
      }

      node.expression = expr;
    } else {
      node.expression = this.parseMaybeAssign();
    }
    return this.finishNode(node, "Decorator");
  }

  parseBreakContinueStatement(node, keyword) {
    const isBreak = keyword === "break";
    this.next();

    if (this.isLineTerminator()) {
      node.label = null;
    } else if (!this.match((_types2 || _load_types2()).types.name)) {
      this.unexpected();
    } else {
      node.label = this.parseIdentifier();
      this.semicolon();
    }

    // Verify that there is an actual destination to break or
    // continue to.
    let i;
    for (i = 0; i < this.state.labels.length; ++i) {
      const lab = this.state.labels[i];
      if (node.label == null || lab.name === node.label.name) {
        if (lab.kind != null && (isBreak || lab.kind === "loop")) break;
        if (node.label && isBreak) break;
      }
    }
    if (i === this.state.labels.length) this.raise(node.start, "Unsyntactic " + keyword);
    return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");
  }

  parseDebuggerStatement(node) {
    this.next();
    this.semicolon();
    return this.finishNode(node, "DebuggerStatement");
  }

  parseDoStatement(node) {
    this.next();
    this.state.labels.push(loopLabel);
    node.body = this.parseStatement(false);
    this.state.labels.pop();
    this.expect((_types2 || _load_types2()).types._while);
    node.test = this.parseParenExpression();
    this.eat((_types2 || _load_types2()).types.semi);
    return this.finishNode(node, "DoWhileStatement");
  }

  // Disambiguating between a `for` and a `for`/`in` or `for`/`of`
  // loop is non-trivial. Basically, we have to parse the init `var`
  // statement or expression, disallowing the `in` operator (see
  // the second parameter to `parseExpression`), and then check
  // whether the next token is `in` or `of`. When there is no init
  // part (semicolon immediately after the opening parenthesis), it
  // is a regular `for` loop.

  parseForStatement(node) {
    this.next();
    this.state.labels.push(loopLabel);

    let forAwait = false;
    if (this.state.inAsync && this.isContextual("await")) {
      this.expectPlugin("asyncGenerators");
      forAwait = true;
      this.next();
    }
    this.expect((_types2 || _load_types2()).types.parenL);

    if (this.match((_types2 || _load_types2()).types.semi)) {
      if (forAwait) {
        this.unexpected();
      }
      return this.parseFor(node, null);
    }

    if (this.match((_types2 || _load_types2()).types._var) || this.match((_types2 || _load_types2()).types._let) || this.match((_types2 || _load_types2()).types._const)) {
      const init = this.startNode();
      const varKind = this.state.type;
      this.next();
      this.parseVar(init, true, varKind);
      this.finishNode(init, "VariableDeclaration");

      if (this.match((_types2 || _load_types2()).types._in) || this.isContextual("of")) {
        if (init.declarations.length === 1 && !init.declarations[0].init) {
          return this.parseForIn(node, init, forAwait);
        }
      }
      if (forAwait) {
        this.unexpected();
      }
      return this.parseFor(node, init);
    }

    const refShorthandDefaultPos = { start: 0 };
    const init = this.parseExpression(true, refShorthandDefaultPos);
    if (this.match((_types2 || _load_types2()).types._in) || this.isContextual("of")) {
      const description = this.isContextual("of") ? "for-of statement" : "for-in statement";
      this.toAssignable(init, undefined, description);
      this.checkLVal(init, undefined, undefined, description);
      return this.parseForIn(node, init, forAwait);
    } else if (refShorthandDefaultPos.start) {
      this.unexpected(refShorthandDefaultPos.start);
    }
    if (forAwait) {
      this.unexpected();
    }
    return this.parseFor(node, init);
  }

  parseFunctionStatement(node) {
    this.next();
    return this.parseFunction(node, true);
  }

  parseIfStatement(node) {
    this.next();
    node.test = this.parseParenExpression();
    node.consequent = this.parseStatement(false);
    node.alternate = this.eat((_types2 || _load_types2()).types._else) ? this.parseStatement(false) : null;
    return this.finishNode(node, "IfStatement");
  }

  parseReturnStatement(node) {
    if (!this.state.inFunction && !this.options.allowReturnOutsideFunction) {
      this.raise(this.state.start, "'return' outside of function");
    }

    this.next();

    // In `return` (and `break`/`continue`), the keywords with
    // optional arguments, we eagerly look for a semicolon or the
    // possibility to insert one.

    if (this.isLineTerminator()) {
      node.argument = null;
    } else {
      node.argument = this.parseExpression();
      this.semicolon();
    }

    return this.finishNode(node, "ReturnStatement");
  }

  parseSwitchStatement(node) {
    this.next();
    node.discriminant = this.parseParenExpression();
    const cases = node.cases = [];
    this.expect((_types2 || _load_types2()).types.braceL);
    this.state.labels.push(switchLabel);

    // Statements under must be grouped (by label) in SwitchCase
    // nodes. `cur` is used to keep the node that we are currently
    // adding statements to.

    let cur;
    for (let sawDefault; !this.match((_types2 || _load_types2()).types.braceR);) {
      if (this.match((_types2 || _load_types2()).types._case) || this.match((_types2 || _load_types2()).types._default)) {
        const isCase = this.match((_types2 || _load_types2()).types._case);
        if (cur) this.finishNode(cur, "SwitchCase");
        cases.push(cur = this.startNode());
        cur.consequent = [];
        this.next();
        if (isCase) {
          cur.test = this.parseExpression();
        } else {
          if (sawDefault) this.raise(this.state.lastTokStart, "Multiple default clauses");
          sawDefault = true;
          cur.test = null;
        }
        this.expect((_types2 || _load_types2()).types.colon);
      } else {
        if (cur) {
          cur.consequent.push(this.parseStatement(true));
        } else {
          this.unexpected();
        }
      }
    }
    if (cur) this.finishNode(cur, "SwitchCase");
    this.next(); // Closing brace
    this.state.labels.pop();
    return this.finishNode(node, "SwitchStatement");
  }

  parseThrowStatement(node) {
    this.next();
    if ((_whitespace || _load_whitespace()).lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start))) this.raise(this.state.lastTokEnd, "Illegal newline after throw");
    node.argument = this.parseExpression();
    this.semicolon();
    return this.finishNode(node, "ThrowStatement");
  }

  parseTryStatement(node) {
    this.next();

    node.block = this.parseBlock();
    node.handler = null;

    if (this.match((_types2 || _load_types2()).types._catch)) {
      const clause = this.startNode();
      this.next();
      if (this.match((_types2 || _load_types2()).types.parenL)) {
        this.expect((_types2 || _load_types2()).types.parenL);
        clause.param = this.parseBindingAtom();
        this.checkLVal(clause.param, true, (0, (_create || _load_create()).default)(null), "catch clause");
        this.expect((_types2 || _load_types2()).types.parenR);
      } else {
        this.expectPlugin("optionalCatchBinding");
        clause.param = null;
      }
      clause.body = this.parseBlock();
      node.handler = this.finishNode(clause, "CatchClause");
    }

    node.guardedHandlers = empty;
    node.finalizer = this.eat((_types2 || _load_types2()).types._finally) ? this.parseBlock() : null;

    if (!node.handler && !node.finalizer) {
      this.raise(node.start, "Missing catch or finally clause");
    }

    return this.finishNode(node, "TryStatement");
  }

  parseVarStatement(node, kind) {
    this.next();
    this.parseVar(node, false, kind);
    this.semicolon();
    return this.finishNode(node, "VariableDeclaration");
  }

  parseWhileStatement(node) {
    this.next();
    node.test = this.parseParenExpression();
    this.state.labels.push(loopLabel);
    node.body = this.parseStatement(false);
    this.state.labels.pop();
    return this.finishNode(node, "WhileStatement");
  }

  parseWithStatement(node) {
    if (this.state.strict) this.raise(this.state.start, "'with' in strict mode");
    this.next();
    node.object = this.parseParenExpression();
    node.body = this.parseStatement(false);
    return this.finishNode(node, "WithStatement");
  }

  parseEmptyStatement(node) {
    this.next();
    return this.finishNode(node, "EmptyStatement");
  }

  parseLabeledStatement(node, maybeName, expr) {
    for (const label of this.state.labels) {
      if (label.name === maybeName) {
        this.raise(expr.start, `Label '${maybeName}' is already declared`);
      }
    }

    const kind = this.state.type.isLoop ? "loop" : this.match((_types2 || _load_types2()).types._switch) ? "switch" : null;
    for (let i = this.state.labels.length - 1; i >= 0; i--) {
      const label = this.state.labels[i];
      if (label.statementStart === node.start) {
        label.statementStart = this.state.start;
        label.kind = kind;
      } else {
        break;
      }
    }

    this.state.labels.push({
      name: maybeName,
      kind: kind,
      statementStart: this.state.start
    });
    node.body = this.parseStatement(true);

    if (node.body.type == "ClassDeclaration" || node.body.type == "VariableDeclaration" && node.body.kind !== "var" || node.body.type == "FunctionDeclaration" && (this.state.strict || node.body.generator || node.body.async)) {
      this.raise(node.body.start, "Invalid labeled declaration");
    }

    this.state.labels.pop();
    node.label = expr;
    return this.finishNode(node, "LabeledStatement");
  }

  parseExpressionStatement(node, expr) {
    node.expression = expr;
    this.semicolon();
    return this.finishNode(node, "ExpressionStatement");
  }

  // Parse a semicolon-enclosed block of statements, handling `"use
  // strict"` declarations when `allowStrict` is true (used for
  // function bodies).

  parseBlock(allowDirectives) {
    const node = this.startNode();
    this.expect((_types2 || _load_types2()).types.braceL);
    this.parseBlockBody(node, allowDirectives, false, (_types2 || _load_types2()).types.braceR);
    return this.finishNode(node, "BlockStatement");
  }

  isValidDirective(stmt) {
    return stmt.type === "ExpressionStatement" && stmt.expression.type === "StringLiteral" && !stmt.expression.extra.parenthesized;
  }

  parseBlockBody(node, allowDirectives, topLevel, end) {
    const body = node.body = [];
    const directives = node.directives = [];
    this.parseBlockOrModuleBlockBody(body, allowDirectives ? directives : undefined, topLevel, end);
  }

  // Undefined directives means that directives are not allowed.
  parseBlockOrModuleBlockBody(body, directives, topLevel, end) {
    let parsedNonDirective = false;
    let oldStrict;
    let octalPosition;

    while (!this.eat(end)) {
      if (!parsedNonDirective && this.state.containsOctal && !octalPosition) {
        octalPosition = this.state.octalPosition;
      }

      const stmt = this.parseStatement(true, topLevel);

      if (directives && !parsedNonDirective && this.isValidDirective(stmt)) {
        const directive = this.stmtToDirective(stmt);
        directives.push(directive);

        if (oldStrict === undefined && directive.value.value === "use strict") {
          oldStrict = this.state.strict;
          this.setStrict(true);

          if (octalPosition) {
            this.raise(octalPosition, "Octal literal in strict mode");
          }
        }

        continue;
      }

      parsedNonDirective = true;
      body.push(stmt);
    }

    if (oldStrict === false) {
      this.setStrict(false);
    }
  }

  // Parse a regular `for` loop. The disambiguation code in
  // `parseStatement` will already have parsed the init statement or
  // expression.

  parseFor(node, init) {
    node.init = init;
    this.expect((_types2 || _load_types2()).types.semi);
    node.test = this.match((_types2 || _load_types2()).types.semi) ? null : this.parseExpression();
    this.expect((_types2 || _load_types2()).types.semi);
    node.update = this.match((_types2 || _load_types2()).types.parenR) ? null : this.parseExpression();
    this.expect((_types2 || _load_types2()).types.parenR);
    node.body = this.parseStatement(false);
    this.state.labels.pop();
    return this.finishNode(node, "ForStatement");
  }

  // Parse a `for`/`in` and `for`/`of` loop, which are almost
  // same from parser's perspective.

  parseForIn(node, init, forAwait) {
    const type = this.match((_types2 || _load_types2()).types._in) ? "ForInStatement" : "ForOfStatement";
    if (forAwait) {
      this.eatContextual("of");
    } else {
      this.next();
    }
    if (type === "ForOfStatement") {
      node.await = !!forAwait;
    }
    node.left = init;
    node.right = this.parseExpression();
    this.expect((_types2 || _load_types2()).types.parenR);
    node.body = this.parseStatement(false);
    this.state.labels.pop();
    return this.finishNode(node, type);
  }

  // Parse a list of variable declarations.

  parseVar(node, isFor, kind) {
    const declarations = node.declarations = [];
    // $FlowFixMe
    node.kind = kind.keyword;
    for (;;) {
      const decl = this.startNode();
      this.parseVarHead(decl);
      if (this.eat((_types2 || _load_types2()).types.eq)) {
        decl.init = this.parseMaybeAssign(isFor);
      } else {
        if (kind === (_types2 || _load_types2()).types._const && !(this.match((_types2 || _load_types2()).types._in) || this.isContextual("of"))) {
          // `const` with no initializer is allowed in TypeScript. It could be a declaration `const x: number;`.
          if (!this.hasPlugin("typescript")) {
            this.unexpected();
          }
        } else if (decl.id.type !== "Identifier" && !(isFor && (this.match((_types2 || _load_types2()).types._in) || this.isContextual("of")))) {
          this.raise(this.state.lastTokEnd, "Complex binding patterns require an initialization value");
        }
        decl.init = null;
      }
      declarations.push(this.finishNode(decl, "VariableDeclarator"));
      if (!this.eat((_types2 || _load_types2()).types.comma)) break;
    }
    return node;
  }

  parseVarHead(decl) {
    decl.id = this.parseBindingAtom();
    this.checkLVal(decl.id, true, undefined, "variable declaration");
  }

  // Parse a function declaration or literal (depending on the
  // `isStatement` parameter).

  parseFunction(node, isStatement, allowExpressionBody, isAsync, optionalId) {
    const oldInMethod = this.state.inMethod;
    this.state.inMethod = false;

    this.initFunction(node, isAsync);

    if (this.match((_types2 || _load_types2()).types.star)) {
      if (node.async) {
        this.expectPlugin("asyncGenerators");
      }
      node.generator = true;
      this.next();
    }

    if (isStatement && !optionalId && !this.match((_types2 || _load_types2()).types.name) && !this.match((_types2 || _load_types2()).types._yield)) {
      this.unexpected();
    }

    if (this.match((_types2 || _load_types2()).types.name) || this.match((_types2 || _load_types2()).types._yield)) {
      node.id = this.parseBindingIdentifier();
    }

    this.parseFunctionParams(node);
    this.parseFunctionBodyAndFinish(node, isStatement ? "FunctionDeclaration" : "FunctionExpression", allowExpressionBody);
    this.state.inMethod = oldInMethod;
    return node;
  }

  parseFunctionParams(node) {
    this.expect((_types2 || _load_types2()).types.parenL);
    node.params = this.parseBindingList((_types2 || _load_types2()).types.parenR);
  }

  // Parse a class declaration or literal (depending on the
  // `isStatement` parameter).

  parseClass(node, isStatement, optionalId) {
    this.next();
    this.takeDecorators(node);
    this.parseClassId(node, isStatement, optionalId);
    this.parseClassSuper(node);
    this.parseClassBody(node);
    return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
  }

  isClassProperty() {
    return this.match((_types2 || _load_types2()).types.eq) || this.match((_types2 || _load_types2()).types.semi) || this.match((_types2 || _load_types2()).types.braceR);
  }

  isClassMethod() {
    return this.match((_types2 || _load_types2()).types.parenL);
  }

  isNonstaticConstructor(method) {
    return !method.computed && !method.static && (method.key.name === "constructor" || // Identifier
    method.key.value === "constructor") // Literal
    ;
  }

  parseClassBody(node) {
    // class bodies are implicitly strict
    const oldStrict = this.state.strict;
    this.state.strict = true;
    this.state.classLevel++;

    const state = { hadConstructor: false };
    let decorators = [];
    const classBody = this.startNode();

    classBody.body = [];

    this.expect((_types2 || _load_types2()).types.braceL);

    while (!this.eat((_types2 || _load_types2()).types.braceR)) {
      if (this.eat((_types2 || _load_types2()).types.semi)) {
        if (decorators.length > 0) {
          this.raise(this.state.lastTokEnd, "Decorators must not be followed by a semicolon");
        }
        continue;
      }

      if (this.match((_types2 || _load_types2()).types.at)) {
        decorators.push(this.parseDecorator());
        continue;
      }

      const member = this.startNode();

      // steal the decorators if there are any
      if (decorators.length) {
        member.decorators = decorators;
        this.resetStartLocationFromNode(member, decorators[0]);
        decorators = [];
      }

      this.parseClassMember(classBody, member, state);

      if (this.hasPlugin("decorators2") && member.kind != "method" && member.decorators && member.decorators.length > 0) {
        this.raise(member.start, "Stage 2 decorators may only be used with a class or a class method");
      }
    }

    if (decorators.length) {
      this.raise(this.state.start, "You have trailing decorators with no method");
    }

    node.body = this.finishNode(classBody, "ClassBody");

    this.state.classLevel--;
    this.state.strict = oldStrict;
  }

  parseClassMember(classBody, member, state) {
    // Use the appropriate variable to represent `member` once a more specific type is known.
    const memberAny = member;
    const method = memberAny;
    const prop = memberAny;

    let isStatic = false;
    if (this.match((_types2 || _load_types2()).types.name) && this.state.value === "static") {
      const key = this.parseIdentifier(true); // eats 'static'
      if (this.isClassMethod()) {
        // a method named 'static'
        method.kind = "method";
        method.computed = false;
        method.key = key;
        method.static = false;
        this.parseClassMethod(classBody, method, false, false,
        /* isConstructor */false);
        return;
      } else if (this.isClassProperty()) {
        // a property named 'static'
        prop.computed = false;
        prop.key = key;
        prop.static = false;
        classBody.body.push(this.parseClassProperty(prop));
        return;
      }
      // otherwise something static
      isStatic = true;
    }

    if (this.match((_types2 || _load_types2()).types.hash)) {
      // Private property
      this.expectPlugin("classPrivateProperties");
      this.next();
      const privateProp = memberAny;
      privateProp.key = this.parseIdentifier(true);
      privateProp.static = isStatic;
      classBody.body.push(this.parsePrivateClassProperty(privateProp));
      return;
    }

    this.parseClassMemberWithIsStatic(classBody, member, state, isStatic);
  }

  parseClassMemberWithIsStatic(classBody, member, state, isStatic) {
    const memberAny = member;
    const methodOrProp = memberAny;
    const method = memberAny;
    const prop = memberAny;

    methodOrProp.static = isStatic;

    if (this.eat((_types2 || _load_types2()).types.star)) {
      // a generator
      method.kind = "method";
      this.parsePropertyName(method);
      if (this.isNonstaticConstructor(method)) {
        this.raise(method.key.start, "Constructor can't be a generator");
      }
      if (!method.computed && method.static && (method.key.name === "prototype" || method.key.value === "prototype")) {
        this.raise(method.key.start, "Classes may not have static property named prototype");
      }
      this.parseClassMethod(classBody, method, true, false,
      /* isConstructor */false);
      return;
    }

    const isSimple = this.match((_types2 || _load_types2()).types.name);
    const key = this.parseClassPropertyName(methodOrProp);

    this.parsePostMemberNameModifiers(methodOrProp);

    if (this.isClassMethod()) {
      // a normal method
      const isConstructor = this.isNonstaticConstructor(method);
      if (isConstructor) {
        method.kind = "constructor";
      } else {
        method.kind = "method";
      }

      if (isConstructor) {
        if (method.decorators) {
          this.raise(method.start, "You can't attach decorators to a class constructor");
        }

        // TypeScript allows multiple overloaded constructor declarations.
        if (state.hadConstructor && !this.hasPlugin("typescript")) {
          this.raise(key.start, "Duplicate constructor in the same class");
        }
        state.hadConstructor = true;
      }

      this.parseClassMethod(classBody, method, false, false, isConstructor);
    } else if (this.isClassProperty()) {
      this.pushClassProperty(classBody, prop);
    } else if (isSimple && key.name === "async" && !this.isLineTerminator()) {
      // an async method
      let isGenerator = false;
      if (this.match((_types2 || _load_types2()).types.star)) {
        this.expectPlugin("asyncGenerators");
        this.next();
        isGenerator = true;
      }
      method.kind = "method";
      this.parsePropertyName(method);
      if (this.isNonstaticConstructor(method)) {
        this.raise(method.key.start, "Constructor can't be an async function");
      }
      this.parseClassMethod(classBody, method, isGenerator, true,
      /* isConstructor */false);
    } else if (isSimple && (key.name === "get" || key.name === "set") && !(this.isLineTerminator() && this.match((_types2 || _load_types2()).types.star))) {
      // `get\n*` is an uninitialized property named 'get' followed by a generator.
      // a getter or setter
      method.kind = key.name;
      this.parsePropertyName(method);
      if (this.isNonstaticConstructor(method)) {
        this.raise(method.key.start, "Constructor can't have get/set modifier");
      }
      this.parseClassMethod(classBody, method, false, false,
      /* isConstructor */false);
      this.checkGetterSetterParamCount(method);
    } else if (this.isLineTerminator()) {
      // an uninitialized class property (due to ASI, since we don't otherwise recognize the next token)
      if (this.isNonstaticConstructor(prop)) {
        this.raise(prop.key.start, "Classes may not have a non-static field named 'constructor'");
      }
      classBody.body.push(this.parseClassProperty(prop));
    } else {
      this.unexpected();
    }
  }

  parseClassPropertyName(methodOrProp) {
    const key = this.parsePropertyName(methodOrProp);
    if (!methodOrProp.computed && methodOrProp.static && (methodOrProp.key.name === "prototype" || methodOrProp.key.value === "prototype")) {
      this.raise(methodOrProp.key.start, "Classes may not have static property named prototype");
    }
    return key;
  }

  pushClassProperty(classBody, prop) {
    if (this.isNonstaticConstructor(prop)) {
      this.raise(prop.key.start, "Classes may not have a non-static field named 'constructor'");
    }
    classBody.body.push(this.parseClassProperty(prop));
  }

  // Overridden in typescript.js
  parsePostMemberNameModifiers(
  // eslint-disable-next-line no-unused-vars
  methodOrProp) {}

  // Overridden in typescript.js
  parseAccessModifier() {
    return undefined;
  }

  parsePrivateClassProperty(node) {
    this.state.inClassProperty = true;

    if (this.match((_types2 || _load_types2()).types.eq)) {
      this.next();
      node.value = this.parseMaybeAssign();
    } else {
      node.value = null;
    }
    this.semicolon();
    this.state.inClassProperty = false;
    return this.finishNode(node, "ClassPrivateProperty");
  }

  parseClassProperty(node) {
    if (!node.typeAnnotation) {
      this.expectPlugin("classProperties");
    }

    this.state.inClassProperty = true;

    if (this.match((_types2 || _load_types2()).types.eq)) {
      this.expectPlugin("classProperties");
      this.next();
      node.value = this.parseMaybeAssign();
    } else {
      node.value = null;
    }
    this.semicolon();
    this.state.inClassProperty = false;

    return this.finishNode(node, "ClassProperty");
  }

  parseClassMethod(classBody, method, isGenerator, isAsync, isConstructor) {
    classBody.body.push(this.parseMethod(method, isGenerator, isAsync, isConstructor, "ClassMethod"));
  }

  parseClassId(node, isStatement, optionalId) {
    if (this.match((_types2 || _load_types2()).types.name)) {
      node.id = this.parseIdentifier();
    } else {
      if (optionalId || !isStatement) {
        node.id = null;
      } else {
        this.unexpected(null, "A class name is required");
      }
    }
  }

  parseClassSuper(node) {
    node.superClass = this.eat((_types2 || _load_types2()).types._extends) ? this.parseExprSubscripts() : null;
  }

  // Parses module export declaration.

  // TODO: better type. Node is an N.AnyExport.
  parseExport(node) {
    // export * from '...'
    if (this.shouldParseExportStar()) {
      this.parseExportStar(node, this.hasPlugin("exportExtensions"));
      if (node.type === "ExportAllDeclaration") return node;
    } else if (this.hasPlugin("exportExtensions") && this.isExportDefaultSpecifier()) {
      const specifier = this.startNode();
      specifier.exported = this.parseIdentifier(true);
      const specifiers = [this.finishNode(specifier, "ExportDefaultSpecifier")];
      node.specifiers = specifiers;
      if (this.match((_types2 || _load_types2()).types.comma) && this.lookahead().type === (_types2 || _load_types2()).types.star) {
        this.expect((_types2 || _load_types2()).types.comma);
        const specifier = this.startNode();
        this.expect((_types2 || _load_types2()).types.star);
        this.expectContextual("as");
        specifier.exported = this.parseIdentifier();
        specifiers.push(this.finishNode(specifier, "ExportNamespaceSpecifier"));
      } else {
        this.parseExportSpecifiersMaybe(node);
      }
      this.parseExportFrom(node, true);
    } else if (this.eat((_types2 || _load_types2()).types._default)) {
      // export default ...
      let expr = this.startNode();
      let needsSemi = false;
      if (this.eat((_types2 || _load_types2()).types._function)) {
        expr = this.parseFunction(expr, true, false, false, true);
      } else if (this.isContextual("async") && this.lookahead().type === (_types2 || _load_types2()).types._function) {
        // async function declaration
        this.eatContextual("async");
        this.eat((_types2 || _load_types2()).types._function);
        expr = this.parseFunction(expr, true, false, true, true);
      } else if (this.match((_types2 || _load_types2()).types._class)) {
        expr = this.parseClass(expr, true, true);
      } else {
        needsSemi = true;
        expr = this.parseMaybeAssign();
      }
      node.declaration = expr;
      if (needsSemi) this.semicolon();
      this.checkExport(node, true, true);
      return this.finishNode(node, "ExportDefaultDeclaration");
    } else if (this.shouldParseExportDeclaration()) {
      if (this.isContextual("async")) {
        const next = this.lookahead();

        // export async;
        if (next.type !== (_types2 || _load_types2()).types._function) {
          this.unexpected(next.start, "Unexpected token, expected function");
        }
      }

      node.specifiers = [];
      node.source = null;
      node.declaration = this.parseExportDeclaration(node);
    } else {
      // export { x, y as z } [from '...']
      node.declaration = null;
      node.specifiers = this.parseExportSpecifiers();
      this.parseExportFrom(node);
    }
    this.checkExport(node, true);
    return this.finishNode(node, "ExportNamedDeclaration");
  }

  // eslint-disable-next-line no-unused-vars
  parseExportDeclaration(node) {
    return this.parseStatement(true);
  }

  isExportDefaultSpecifier() {
    if (this.match((_types2 || _load_types2()).types.name)) {
      return this.state.value !== "async";
    }

    if (!this.match((_types2 || _load_types2()).types._default)) {
      return false;
    }

    const lookahead = this.lookahead();
    return lookahead.type === (_types2 || _load_types2()).types.comma || lookahead.type === (_types2 || _load_types2()).types.name && lookahead.value === "from";
  }

  parseExportSpecifiersMaybe(node) {
    if (this.eat((_types2 || _load_types2()).types.comma)) {
      node.specifiers = node.specifiers.concat(this.parseExportSpecifiers());
    }
  }

  parseExportFrom(node, expect) {
    if (this.eatContextual("from")) {
      node.source = this.match((_types2 || _load_types2()).types.string) ? this.parseExprAtom() : this.unexpected();
      this.checkExport(node);
    } else {
      if (expect) {
        this.unexpected();
      } else {
        node.source = null;
      }
    }

    this.semicolon();
  }

  shouldParseExportStar() {
    return this.match((_types2 || _load_types2()).types.star);
  }

  parseExportStar(node, allowNamed) {
    this.expect((_types2 || _load_types2()).types.star);

    if (allowNamed && this.isContextual("as")) {
      const specifier = this.startNodeAt(this.state.lastTokStart, this.state.lastTokStartLoc);
      this.next();
      specifier.exported = this.parseIdentifier(true);
      node.specifiers = [this.finishNode(specifier, "ExportNamespaceSpecifier")];
      this.parseExportSpecifiersMaybe(node);
      this.parseExportFrom(node, true);
    } else {
      this.parseExportFrom(node, true);
      this.finishNode(node, "ExportAllDeclaration");
    }
  }

  shouldParseExportDeclaration() {
    return this.state.type.keyword === "var" || this.state.type.keyword === "const" || this.state.type.keyword === "let" || this.state.type.keyword === "function" || this.state.type.keyword === "class" || this.isContextual("async");
  }

  checkExport(node, checkNames, isDefault) {
    if (checkNames) {
      // Check for duplicate exports
      if (isDefault) {
        // Default exports
        this.checkDuplicateExports(node, "default");
      } else if (node.specifiers && node.specifiers.length) {
        // Named exports
        for (const specifier of node.specifiers) {
          this.checkDuplicateExports(specifier, specifier.exported.name);
        }
      } else if (node.declaration) {
        // Exported declarations
        if (node.declaration.type === "FunctionDeclaration" || node.declaration.type === "ClassDeclaration") {
          this.checkDuplicateExports(node, node.declaration.id.name);
        } else if (node.declaration.type === "VariableDeclaration") {
          for (const declaration of node.declaration.declarations) {
            this.checkDeclaration(declaration.id);
          }
        }
      }
    }

    const currentContextDecorators = this.state.decoratorStack[this.state.decoratorStack.length - 1];
    if (currentContextDecorators.length) {
      const isClass = node.declaration && (node.declaration.type === "ClassDeclaration" || node.declaration.type === "ClassExpression");
      if (!node.declaration || !isClass) {
        throw this.raise(node.start, "You can only use decorators on an export when exporting a class");
      }
      this.takeDecorators(node.declaration);
    }
  }

  checkDeclaration(node) {
    if (node.type === "ObjectPattern") {
      for (const prop of node.properties) {
        // $FlowFixMe (prop may be an AssignmentProperty, in which case this does nothing?)
        this.checkDeclaration(prop);
      }
    } else if (node.type === "ArrayPattern") {
      for (const elem of node.elements) {
        if (elem) {
          this.checkDeclaration(elem);
        }
      }
    } else if (node.type === "ObjectProperty") {
      this.checkDeclaration(node.value);
    } else if (node.type === "RestElement") {
      this.checkDeclaration(node.argument);
    } else if (node.type === "Identifier") {
      this.checkDuplicateExports(node, node.name);
    }
  }

  checkDuplicateExports(node, name) {
    if (this.state.exportedIdentifiers.indexOf(name) > -1) {
      this.raiseDuplicateExportError(node, name);
    }
    this.state.exportedIdentifiers.push(name);
  }

  raiseDuplicateExportError(node, name) {
    throw this.raise(node.start, name === "default" ? "Only one default export allowed per module." : `\`${name}\` has already been exported. Exported identifiers must be unique.`);
  }

  // Parses a comma-separated list of module exports.

  parseExportSpecifiers() {
    const nodes = [];
    let first = true;
    let needsFrom;

    // export { x, y as z } [from '...']
    this.expect((_types2 || _load_types2()).types.braceL);

    while (!this.eat((_types2 || _load_types2()).types.braceR)) {
      if (first) {
        first = false;
      } else {
        this.expect((_types2 || _load_types2()).types.comma);
        if (this.eat((_types2 || _load_types2()).types.braceR)) break;
      }

      const isDefault = this.match((_types2 || _load_types2()).types._default);
      if (isDefault && !needsFrom) needsFrom = true;

      const node = this.startNode();
      node.local = this.parseIdentifier(isDefault);
      node.exported = this.eatContextual("as") ? this.parseIdentifier(true) : node.local.__clone();
      nodes.push(this.finishNode(node, "ExportSpecifier"));
    }

    // https://github.com/ember-cli/ember-cli/pull/3739
    if (needsFrom && !this.isContextual("from")) {
      this.unexpected();
    }

    return nodes;
  }

  // Parses import declaration.

  parseImport(node) {
    // import '...'
    if (this.match((_types2 || _load_types2()).types.string)) {
      node.specifiers = [];
      node.source = this.parseExprAtom();
    } else {
      node.specifiers = [];
      this.parseImportSpecifiers(node);
      this.expectContextual("from");
      node.source = this.match((_types2 || _load_types2()).types.string) ? this.parseExprAtom() : this.unexpected();
    }
    this.semicolon();
    return this.finishNode(node, "ImportDeclaration");
  }

  // Parses a comma-separated list of module imports.

  parseImportSpecifiers(node) {
    let first = true;
    if (this.match((_types2 || _load_types2()).types.name)) {
      // import defaultObj, { x, y as z } from '...'
      const startPos = this.state.start;
      const startLoc = this.state.startLoc;
      node.specifiers.push(this.parseImportSpecifierDefault(this.parseIdentifier(), startPos, startLoc));
      if (!this.eat((_types2 || _load_types2()).types.comma)) return;
    }

    if (this.match((_types2 || _load_types2()).types.star)) {
      const specifier = this.startNode();
      this.next();
      this.expectContextual("as");
      specifier.local = this.parseIdentifier();
      this.checkLVal(specifier.local, true, undefined, "import namespace specifier");
      node.specifiers.push(this.finishNode(specifier, "ImportNamespaceSpecifier"));
      return;
    }

    this.expect((_types2 || _load_types2()).types.braceL);
    while (!this.eat((_types2 || _load_types2()).types.braceR)) {
      if (first) {
        first = false;
      } else {
        // Detect an attempt to deep destructure
        if (this.eat((_types2 || _load_types2()).types.colon)) {
          this.unexpected(null, "ES2015 named imports do not destructure. Use another statement for destructuring after the import.");
        }

        this.expect((_types2 || _load_types2()).types.comma);
        if (this.eat((_types2 || _load_types2()).types.braceR)) break;
      }

      this.parseImportSpecifier(node);
    }
  }

  parseImportSpecifier(node) {
    const specifier = this.startNode();
    specifier.imported = this.parseIdentifier(true);
    if (this.eatContextual("as")) {
      specifier.local = this.parseIdentifier();
    } else {
      this.checkReservedWord(specifier.imported.name, specifier.start, true, true);
      specifier.local = specifier.imported.__clone();
    }
    this.checkLVal(specifier.local, true, undefined, "import specifier");
    node.specifiers.push(this.finishNode(specifier, "ImportSpecifier"));
  }

  parseImportSpecifierDefault(id, startPos, startLoc) {
    const node = this.startNodeAt(startPos, startLoc);
    node.local = id;
    this.checkLVal(node.local, true, undefined, "default import specifier");
    return this.finishNode(node, "ImportDefaultSpecifier");
  }
}
exports.default = StatementParser;
module.exports = exports["default"];