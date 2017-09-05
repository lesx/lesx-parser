"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _types;

function _load_types() {
  return _types = require("../tokenizer/types");
}

var _context;

function _load_context() {
  return _context = require("../tokenizer/context");
}

var _types2;

function _load_types2() {
  return _types2 = _interopRequireWildcard(require("../types"));
}

var _parser;

function _load_parser() {
  return _parser = _interopRequireDefault(require("../parser"));
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function nonNull(x) {
  if (x == null) {
    // $FlowIgnore
    throw new Error(`Unexpected ${x} value.`);
  }
  return x;
}

function assert(x) {
  if (!x) {
    throw new Error("Assert fail");
  }
}

// Doesn't handle "void" or "null" because those are keywords, not identifiers.
function keywordTypeFromName(value) {
  switch (value) {
    case "any":
      return "TSAnyKeyword";
    case "boolean":
      return "TSBooleanKeyword";
    case "never":
      return "TSNeverKeyword";
    case "number":
      return "TSNumberKeyword";
    case "object":
      return "TSObjectKeyword";
    case "string":
      return "TSStringKeyword";
    case "symbol":
      return "TSSymbolKeyword";
    case "undefined":
      return "TSUndefinedKeyword";
    default:
      return undefined;
  }
}

exports.default = superClass => class extends superClass {
  tsIsIdentifier() {
    // TODO: actually a bit more complex in TypeScript, but shouldn't matter.
    // See https://github.com/Microsoft/TypeScript/issues/15008
    return this.match((_types || _load_types()).types.name);
  }

  tsNextTokenCanFollowModifier() {
    // Note: TypeScript's implementation is much more complicated because
    // more things are considered modifiers there.
    // This implementation only handles modifiers not handled by babylon itself. And "static".
    // TODO: Would be nice to avoid lookahead. Want a hasLineBreakUpNext() method...
    this.next();
    return !this.hasPrecedingLineBreak() && !this.match((_types || _load_types()).types.parenL) && !this.match((_types || _load_types()).types.colon) && !this.match((_types || _load_types()).types.eq) && !this.match((_types || _load_types()).types.question);
  }

  /** Parses a modifier matching one the given modifier names. */
  tsParseModifier(allowedModifiers) {
    if (!this.match((_types || _load_types()).types.name)) {
      return undefined;
    }

    const modifier = this.state.value;
    if (allowedModifiers.indexOf(modifier) !== -1 && this.tsTryParse(this.tsNextTokenCanFollowModifier.bind(this))) {
      return modifier;
    }
    return undefined;
  }

  tsIsListTerminator(kind) {
    switch (kind) {
      case "EnumMembers":
      case "TypeMembers":
        return this.match((_types || _load_types()).types.braceR);
      case "HeritageClauseElement":
        return this.match((_types || _load_types()).types.braceL);
      case "TupleElementTypes":
        return this.match((_types || _load_types()).types.bracketR);
      case "TypeParametersOrArguments":
        return this.isRelational(">");
    }

    throw new Error("Unreachable");
  }

  tsParseList(kind, parseElement) {
    const result = [];
    while (!this.tsIsListTerminator(kind)) {
      // Skipping "parseListElement" from the TS source since that's just for error handling.
      result.push(parseElement());
    }
    return result;
  }

  tsParseDelimitedList(kind, parseElement) {
    return nonNull(this.tsParseDelimitedListWorker(kind, parseElement,
    /* expectSuccess */true));
  }

  tsTryParseDelimitedList(kind, parseElement) {
    return this.tsParseDelimitedListWorker(kind, parseElement,
    /* expectSuccess */false);
  }

  /**
  * If !expectSuccess, returns undefined instead of failing to parse.
  * If expectSuccess, parseElement should always return a defined value.
  */
  tsParseDelimitedListWorker(kind, parseElement, expectSuccess) {
    const result = [];

    while (true) {
      if (this.tsIsListTerminator(kind)) {
        break;
      }

      const element = parseElement();
      if (element == null) {
        return undefined;
      }
      result.push(element);

      if (this.eat((_types || _load_types()).types.comma)) {
        continue;
      }

      if (this.tsIsListTerminator(kind)) {
        break;
      }

      if (expectSuccess) {
        // This will fail with an error about a missing comma
        this.expect((_types || _load_types()).types.comma);
      }
      return undefined;
    }

    return result;
  }

  tsParseBracketedList(kind, parseElement, bracket, skipFirstToken) {
    if (!skipFirstToken) {
      if (bracket) {
        this.expect((_types || _load_types()).types.bracketL);
      } else {
        this.expectRelational("<");
      }
    }

    const result = this.tsParseDelimitedList(kind, parseElement);

    if (bracket) {
      this.expect((_types || _load_types()).types.bracketR);
    } else {
      this.expectRelational(">");
    }

    return result;
  }

  tsParseEntityName(allowReservedWords) {
    let entity = this.parseIdentifier();
    while (this.eat((_types || _load_types()).types.dot)) {
      const node = this.startNodeAtNode(entity);
      node.left = entity;
      node.right = this.parseIdentifier(allowReservedWords);
      entity = this.finishNode(node, "TSQualifiedName");
    }
    return entity;
  }

  tsParseTypeReference() {
    const node = this.startNode();
    node.typeName = this.tsParseEntityName( /* allowReservedWords */false);
    if (!this.hasPrecedingLineBreak() && this.isRelational("<")) {
      node.typeParameters = this.tsParseTypeArguments();
    }
    return this.finishNode(node, "TSTypeReference");
  }

  tsParseThisTypePredicate(lhs) {
    this.next();
    const node = this.startNode();
    node.parameterName = lhs;
    node.typeAnnotation = this.tsParseTypeAnnotation( /* eatColon */false);
    return this.finishNode(node, "TSTypePredicate");
  }

  tsParseThisTypeNode() {
    const node = this.startNode();
    this.next();
    return this.finishNode(node, "TSThisType");
  }

  tsParseTypeQuery() {
    const node = this.startNode();
    this.expect((_types || _load_types()).types._typeof);
    node.exprName = this.tsParseEntityName( /* allowReservedWords */true);
    return this.finishNode(node, "TSTypeQuery");
  }

  tsParseTypeParameter() {
    const node = this.startNode();
    node.name = this.parseIdentifierName(node.start);
    if (this.eat((_types || _load_types()).types._extends)) {
      node.constraint = this.tsParseType();
    }

    if (this.eat((_types || _load_types()).types.eq)) {
      node.default = this.tsParseType();
    }

    return this.finishNode(node, "TypeParameter");
  }

  tsTryParseTypeParameters() {
    if (this.isRelational("<")) {
      return this.tsParseTypeParameters();
    }
  }

  tsParseTypeParameters() {
    const node = this.startNode();

    if (this.isRelational("<") || this.match((_types || _load_types()).types.jsxTagStart)) {
      this.next();
    } else {
      this.unexpected();
    }

    node.params = this.tsParseBracketedList("TypeParametersOrArguments", this.tsParseTypeParameter.bind(this),
    /* bracket */false,
    /* skipFirstToken */true);
    return this.finishNode(node, "TypeParameterDeclaration");
  }

  // Note: In TypeScript implementation we must provide `yieldContext` and `awaitContext`,
  // but here it's always false, because this is only used for types.
  tsFillSignature(returnToken, signature) {
    // Arrow fns *must* have return token (`=>`). Normal functions can omit it.
    const returnTokenRequired = returnToken === (_types || _load_types()).types.arrow;
    signature.typeParameters = this.tsTryParseTypeParameters();
    this.expect((_types || _load_types()).types.parenL);
    signature.parameters = this.tsParseBindingListForSignature();
    if (returnTokenRequired) {
      signature.typeAnnotation = this.tsParseTypeOrTypePredicateAnnotation(returnToken);
    } else if (this.match(returnToken)) {
      signature.typeAnnotation = this.tsParseTypeOrTypePredicateAnnotation(returnToken);
    }
  }

  tsParseBindingListForSignature() {
    return this.parseBindingList((_types || _load_types()).types.parenR).map(pattern => {
      if (pattern.type !== "Identifier" && pattern.type !== "RestElement") {
        throw this.unexpected(pattern.start, "Name in a signature must be an Identifier.");
      }
      return pattern;
    });
  }

  tsParseTypeMemberSemicolon() {
    if (!this.eat((_types || _load_types()).types.comma)) {
      this.semicolon();
    }
  }

  tsParseSignatureMember(kind) {
    const node = this.startNode();
    if (kind === "TSConstructSignatureDeclaration") {
      this.expect((_types || _load_types()).types._new);
    }
    this.tsFillSignature((_types || _load_types()).types.colon, node);
    this.tsParseTypeMemberSemicolon();
    return this.finishNode(node, kind);
  }

  tsIsUnambiguouslyIndexSignature() {
    this.next(); // Skip '{'
    return this.eat((_types || _load_types()).types.name) && this.match((_types || _load_types()).types.colon);
  }

  tsTryParseIndexSignature(node) {
    if (!(this.match((_types || _load_types()).types.bracketL) && this.tsLookAhead(this.tsIsUnambiguouslyIndexSignature.bind(this)))) {
      return undefined;
    }

    this.expect((_types || _load_types()).types.bracketL);
    const id = this.parseIdentifier();
    this.expect((_types || _load_types()).types.colon);
    id.typeAnnotation = this.tsParseTypeAnnotation( /* eatColon */false);
    this.expect((_types || _load_types()).types.bracketR);
    node.parameters = [id];

    const type = this.tsTryParseTypeAnnotation();
    if (type) node.typeAnnotation = type;
    this.tsParseTypeMemberSemicolon();
    return this.finishNode(node, "TSIndexSignature");
  }

  tsParsePropertyOrMethodSignature(node, readonly) {
    this.parsePropertyName(node);
    if (this.eat((_types || _load_types()).types.question)) node.optional = true;
    const nodeAny = node;

    if (!readonly && (this.match((_types || _load_types()).types.parenL) || this.isRelational("<"))) {
      const method = nodeAny;
      this.tsFillSignature((_types || _load_types()).types.colon, method);
      this.tsParseTypeMemberSemicolon();
      return this.finishNode(method, "TSMethodSignature");
    } else {
      const property = nodeAny;
      if (readonly) property.readonly = true;
      const type = this.tsTryParseTypeAnnotation();
      if (type) property.typeAnnotation = type;
      this.tsParseTypeMemberSemicolon();
      return this.finishNode(property, "TSPropertySignature");
    }
  }

  tsParseTypeMember() {
    if (this.match((_types || _load_types()).types.parenL) || this.isRelational("<")) {
      return this.tsParseSignatureMember("TSCallSignatureDeclaration");
    }
    if (this.match((_types || _load_types()).types._new) && this.tsLookAhead(this.tsIsStartOfConstructSignature.bind(this))) {
      return this.tsParseSignatureMember("TSConstructSignatureDeclaration");
    }
    // Instead of fullStart, we create a node here.
    const node = this.startNode();
    const readonly = !!this.tsParseModifier(["readonly"]);

    const idx = this.tsTryParseIndexSignature(node);
    if (idx) {
      if (readonly) node.readonly = true;
      return idx;
    }
    return this.tsParsePropertyOrMethodSignature(node, readonly);
  }

  tsIsStartOfConstructSignature() {
    this.next();
    return this.match((_types || _load_types()).types.parenL) || this.isRelational("<");
  }

  tsParseTypeLiteral() {
    const node = this.startNode();
    node.members = this.tsParseObjectTypeMembers();
    return this.finishNode(node, "TSTypeLiteral");
  }

  tsParseObjectTypeMembers() {
    this.expect((_types || _load_types()).types.braceL);
    const members = this.tsParseList("TypeMembers", this.tsParseTypeMember.bind(this));
    this.expect((_types || _load_types()).types.braceR);
    return members;
  }

  tsIsStartOfMappedType() {
    this.next();
    if (this.isContextual("readonly")) {
      this.next();
    }
    if (!this.match((_types || _load_types()).types.bracketL)) {
      return false;
    }
    this.next();
    if (!this.tsIsIdentifier()) {
      return false;
    }
    this.next();
    return this.match((_types || _load_types()).types._in);
  }

  tsParseMappedTypeParameter() {
    const node = this.startNode();
    node.name = this.parseIdentifierName(node.start);
    this.expect((_types || _load_types()).types._in);
    node.constraint = this.tsParseType();
    return this.finishNode(node, "TypeParameter");
  }

  tsParseMappedType() {
    const node = this.startNode();

    this.expect((_types || _load_types()).types.braceL);
    if (this.eatContextual("readonly")) {
      node.readonly = true;
    }
    this.expect((_types || _load_types()).types.bracketL);
    node.typeParameter = this.tsParseMappedTypeParameter();
    this.expect((_types || _load_types()).types.bracketR);
    if (this.eat((_types || _load_types()).types.question)) {
      node.optional = true;
    }
    node.typeAnnotation = this.tsTryParseType();
    this.semicolon();
    this.expect((_types || _load_types()).types.braceR);

    return this.finishNode(node, "TSMappedType");
  }

  tsParseTupleType() {
    const node = this.startNode();
    node.elementTypes = this.tsParseBracketedList("TupleElementTypes", this.tsParseType.bind(this),
    /* bracket */true,
    /* skipFirstToken */false);
    return this.finishNode(node, "TSTupleType");
  }

  tsParseParenthesizedType() {
    const node = this.startNode();
    this.expect((_types || _load_types()).types.parenL);
    node.typeAnnotation = this.tsParseType();
    this.expect((_types || _load_types()).types.parenR);
    return this.finishNode(node, "TSParenthesizedType");
  }

  tsParseFunctionOrConstructorType(type) {
    const node = this.startNode();
    if (type === "TSConstructorType") {
      this.expect((_types || _load_types()).types._new);
    }
    this.tsFillSignature((_types || _load_types()).types.arrow, node);
    return this.finishNode(node, type);
  }

  tsParseLiteralTypeNode() {
    const node = this.startNode();
    node.literal = (() => {
      switch (this.state.type) {
        case (_types || _load_types()).types.num:
          return this.parseLiteral(this.state.value, "NumericLiteral");
        case (_types || _load_types()).types.string:
          return this.parseLiteral(this.state.value, "StringLiteral");
        case (_types || _load_types()).types._true:
        case (_types || _load_types()).types._false:
          return this.parseBooleanLiteral();
        default:
          throw this.unexpected();
      }
    })();
    return this.finishNode(node, "TSLiteralType");
  }

  tsParseNonArrayType() {
    switch (this.state.type) {
      case (_types || _load_types()).types.name:
      case (_types || _load_types()).types._void:
      case (_types || _load_types()).types._null:
        {
          const type = this.match((_types || _load_types()).types._void) ? "TSVoidKeyword" : this.match((_types || _load_types()).types._null) ? "TSNullKeyword" : keywordTypeFromName(this.state.value);
          if (type !== undefined && this.lookahead().type !== (_types || _load_types()).types.dot) {
            const node = this.startNode();
            this.next();
            return this.finishNode(node, type);
          }
          return this.tsParseTypeReference();
        }
      case (_types || _load_types()).types.string:
      case (_types || _load_types()).types.num:
      case (_types || _load_types()).types._true:
      case (_types || _load_types()).types._false:
        return this.tsParseLiteralTypeNode();
      case (_types || _load_types()).types.plusMin:
        if (this.state.value === "-") {
          const node = this.startNode();
          this.next();
          if (!this.match((_types || _load_types()).types.num)) {
            throw this.unexpected();
          }
          node.literal = this.parseLiteral(-this.state.value, "NumericLiteral", node.start, node.loc.start);
          return this.finishNode(node, "TSLiteralType");
        }
        break;
      case (_types || _load_types()).types._this:
        {
          const thisKeyword = this.tsParseThisTypeNode();
          if (this.isContextual("is") && !this.hasPrecedingLineBreak()) {
            return this.tsParseThisTypePredicate(thisKeyword);
          } else {
            return thisKeyword;
          }
        }
      case (_types || _load_types()).types._typeof:
        return this.tsParseTypeQuery();
      case (_types || _load_types()).types.braceL:
        return this.tsLookAhead(this.tsIsStartOfMappedType.bind(this)) ? this.tsParseMappedType() : this.tsParseTypeLiteral();
      case (_types || _load_types()).types.bracketL:
        return this.tsParseTupleType();
      case (_types || _load_types()).types.parenL:
        return this.tsParseParenthesizedType();
    }

    throw this.unexpected();
  }

  tsParseArrayTypeOrHigher() {
    let type = this.tsParseNonArrayType();
    while (!this.hasPrecedingLineBreak() && this.eat((_types || _load_types()).types.bracketL)) {
      if (this.match((_types || _load_types()).types.bracketR)) {
        const node = this.startNodeAtNode(type);
        node.elementType = type;
        this.expect((_types || _load_types()).types.bracketR);
        type = this.finishNode(node, "TSArrayType");
      } else {
        const node = this.startNodeAtNode(type);
        node.objectType = type;
        node.indexType = this.tsParseType();
        this.expect((_types || _load_types()).types.bracketR);
        type = this.finishNode(node, "TSIndexedAccessType");
      }
    }
    return type;
  }

  tsParseTypeOperator(operator) {
    const node = this.startNode();
    this.expectContextual(operator);
    node.operator = operator;
    node.typeAnnotation = this.tsParseTypeOperatorOrHigher();
    return this.finishNode(node, "TSTypeOperator");
  }

  tsParseTypeOperatorOrHigher() {
    if (this.isContextual("keyof")) {
      return this.tsParseTypeOperator("keyof");
    }
    return this.tsParseArrayTypeOrHigher();
  }

  tsParseUnionOrIntersectionType(kind, parseConstituentType, operator) {
    this.eat(operator);
    let type = parseConstituentType();
    if (this.match(operator)) {
      const types = [type];
      while (this.eat(operator)) {
        types.push(parseConstituentType());
      }
      const node = this.startNodeAtNode(type);
      node.types = types;
      type = this.finishNode(node, kind);
    }
    return type;
  }

  tsParseIntersectionTypeOrHigher() {
    return this.tsParseUnionOrIntersectionType("TSIntersectionType", this.tsParseTypeOperatorOrHigher.bind(this), (_types || _load_types()).types.bitwiseAND);
  }

  tsParseUnionTypeOrHigher() {
    return this.tsParseUnionOrIntersectionType("TSUnionType", this.tsParseIntersectionTypeOrHigher.bind(this), (_types || _load_types()).types.bitwiseOR);
  }

  tsIsStartOfFunctionType() {
    if (this.isRelational("<")) {
      return true;
    }
    return this.match((_types || _load_types()).types.parenL) && this.tsLookAhead(this.tsIsUnambiguouslyStartOfFunctionType.bind(this));
  }

  tsSkipParameterStart() {
    if (this.match((_types || _load_types()).types.name) || this.match((_types || _load_types()).types._this)) {
      this.next();
      return true;
    }
    return false;
  }

  tsIsUnambiguouslyStartOfFunctionType() {
    this.next();
    if (this.match((_types || _load_types()).types.parenR) || this.match((_types || _load_types()).types.ellipsis)) {
      // ( )
      // ( ...
      return true;
    }
    if (this.tsSkipParameterStart()) {
      if (this.match((_types || _load_types()).types.colon) || this.match((_types || _load_types()).types.comma) || this.match((_types || _load_types()).types.question) || this.match((_types || _load_types()).types.eq)) {
        // ( xxx :
        // ( xxx ,
        // ( xxx ?
        // ( xxx =
        return true;
      }
      if (this.match((_types || _load_types()).types.parenR)) {
        this.next();
        if (this.match((_types || _load_types()).types.arrow)) {
          // ( xxx ) =>
          return true;
        }
      }
    }
    return false;
  }

  tsParseTypeOrTypePredicateAnnotation(returnToken) {
    const t = this.startNode();
    this.expect(returnToken);

    const typePredicateVariable = this.tsIsIdentifier() && this.tsTryParse(this.tsParseTypePredicatePrefix.bind(this));

    if (!typePredicateVariable) {
      return this.tsParseTypeAnnotation( /* eatColon */false, t);
    }

    const type = this.tsParseTypeAnnotation( /* eatColon */false);

    const node = this.startNodeAtNode(typePredicateVariable);
    node.parameterName = typePredicateVariable;
    node.typeAnnotation = type;
    t.typeAnnotation = this.finishNode(node, "TSTypePredicate");
    return this.finishNode(t, "TypeAnnotation");
  }

  tsTryParseTypeOrTypePredicateAnnotation() {
    return this.match((_types || _load_types()).types.colon) ? this.tsParseTypeOrTypePredicateAnnotation((_types || _load_types()).types.colon) : undefined;
  }

  tsTryParseTypeAnnotation() {
    return this.match((_types || _load_types()).types.colon) ? this.tsParseTypeAnnotation() : undefined;
  }

  tsTryParseType() {
    return this.eat((_types || _load_types()).types.colon) ? this.tsParseType() : undefined;
  }

  tsParseTypePredicatePrefix() {
    const id = this.parseIdentifier();
    if (this.isContextual("is") && !this.hasPrecedingLineBreak()) {
      this.next();
      return id;
    }
  }

  tsParseTypeAnnotation(eatColon = true, t = this.startNode()) {
    if (eatColon) this.expect((_types || _load_types()).types.colon);
    t.typeAnnotation = this.tsParseType();
    return this.finishNode(t, "TypeAnnotation");
  }

  tsParseType() {
    // Need to set `state.inType` so that we don't parse JSX in a type context.
    const oldInType = this.state.inType;
    this.state.inType = true;
    try {
      if (this.tsIsStartOfFunctionType()) {
        return this.tsParseFunctionOrConstructorType("TSFunctionType");
      }
      if (this.match((_types || _load_types()).types._new)) {
        // As in `new () => Date`
        return this.tsParseFunctionOrConstructorType("TSConstructorType");
      }
      return this.tsParseUnionTypeOrHigher();
    } finally {
      this.state.inType = oldInType;
    }
  }

  tsParseTypeAssertion() {
    const node = this.startNode();
    node.typeAnnotation = this.tsParseType();
    this.expectRelational(">");
    node.expression = this.parseMaybeUnary();
    return this.finishNode(node, "TSTypeAssertion");
  }

  tsTryParseTypeArgumentsInExpression() {
    return this.tsTryParseAndCatch(() => {
      const res = this.startNode();
      this.expectRelational("<");
      const typeArguments = this.tsParseDelimitedList("TypeParametersOrArguments", this.tsParseType.bind(this));
      this.expectRelational(">");
      res.params = typeArguments;
      this.finishNode(res, "TypeParameterInstantiation");
      this.expect((_types || _load_types()).types.parenL);
      return res;
    });
  }

  tsParseHeritageClause() {
    return this.tsParseDelimitedList("HeritageClauseElement", this.tsParseExpressionWithTypeArguments.bind(this));
  }

  tsParseExpressionWithTypeArguments() {
    const node = this.startNode();
    // Note: TS uses parseLeftHandSideExpressionOrHigher,
    // then has grammar errors later if it's not an EntityName.
    node.expression = this.tsParseEntityName( /* allowReservedWords */false);
    if (this.isRelational("<")) {
      node.typeParameters = this.tsParseTypeArguments();
    }

    return this.finishNode(node, "TSExpressionWithTypeArguments");
  }

  tsParseInterfaceDeclaration(node) {
    node.id = this.parseIdentifier();
    node.typeParameters = this.tsTryParseTypeParameters();
    if (this.eat((_types || _load_types()).types._extends)) {
      node.extends = this.tsParseHeritageClause();
    }
    const body = this.startNode();
    body.body = this.tsParseObjectTypeMembers();
    node.body = this.finishNode(body, "TSInterfaceBody");
    return this.finishNode(node, "TSInterfaceDeclaration");
  }

  tsParseTypeAliasDeclaration(node) {
    node.id = this.parseIdentifier();
    node.typeParameters = this.tsTryParseTypeParameters();
    this.expect((_types || _load_types()).types.eq);
    node.typeAnnotation = this.tsParseType();
    this.semicolon();
    return this.finishNode(node, "TSTypeAliasDeclaration");
  }

  tsParseEnumMember() {
    const node = this.startNode();
    // Computed property names are grammar errors in an enum, so accept just string literal or identifier.
    node.id = this.match((_types || _load_types()).types.string) ? this.parseLiteral(this.state.value, "StringLiteral") : this.parseIdentifier( /* liberal */true);
    if (this.eat((_types || _load_types()).types.eq)) {
      node.initializer = this.parseMaybeAssign();
    }
    return this.finishNode(node, "TSEnumMember");
  }

  tsParseEnumDeclaration(node, isConst) {
    if (isConst) node.const = true;
    node.id = this.parseIdentifier();
    this.expect((_types || _load_types()).types.braceL);
    node.members = this.tsParseDelimitedList("EnumMembers", this.tsParseEnumMember.bind(this));
    this.expect((_types || _load_types()).types.braceR);
    return this.finishNode(node, "TSEnumDeclaration");
  }

  tsParseModuleBlock() {
    const node = this.startNode();
    this.expect((_types || _load_types()).types.braceL);
    // Inside of a module block is considered "top-level", meaning it can have imports and exports.
    this.parseBlockOrModuleBlockBody(node.body = [],
    /* directives */undefined,
    /* topLevel */true,
    /* end */(_types || _load_types()).types.braceR);
    return this.finishNode(node, "TSModuleBlock");
  }

  tsParseModuleOrNamespaceDeclaration(node) {
    node.id = this.parseIdentifier();
    if (this.eat((_types || _load_types()).types.dot)) {
      const inner = this.startNode();
      this.tsParseModuleOrNamespaceDeclaration(inner);
      node.body = inner;
    } else {
      node.body = this.tsParseModuleBlock();
    }
    return this.finishNode(node, "TSModuleDeclaration");
  }

  tsParseAmbientExternalModuleDeclaration(node) {
    if (this.isContextual("global")) {
      node.global = true;
      node.id = this.parseIdentifier();
    } else if (this.match((_types || _load_types()).types.string)) {
      node.id = this.parseExprAtom();
    } else {
      this.unexpected();
    }

    if (this.match((_types || _load_types()).types.braceL)) {
      node.body = this.tsParseModuleBlock();
    } else {
      this.semicolon();
    }

    return this.finishNode(node, "TSModuleDeclaration");
  }

  tsParseImportEqualsDeclaration(node, isExport) {
    node.isExport = isExport || false;
    node.id = this.parseIdentifier();
    this.expect((_types || _load_types()).types.eq);
    node.moduleReference = this.tsParseModuleReference();
    this.semicolon();
    return this.finishNode(node, "TSImportEqualsDeclaration");
  }

  tsIsExternalModuleReference() {
    return this.isContextual("require") && this.lookahead().type === (_types || _load_types()).types.parenL;
  }

  tsParseModuleReference() {
    return this.tsIsExternalModuleReference() ? this.tsParseExternalModuleReference() : this.tsParseEntityName( /* allowReservedWords */false);
  }

  tsParseExternalModuleReference() {
    const node = this.startNode();
    this.expectContextual("require");
    this.expect((_types || _load_types()).types.parenL);
    if (!this.match((_types || _load_types()).types.string)) {
      throw this.unexpected();
    }
    node.expression = this.parseLiteral(this.state.value, "StringLiteral");
    this.expect((_types || _load_types()).types.parenR);
    return this.finishNode(node, "TSExternalModuleReference");
  }

  // Utilities

  tsLookAhead(f) {
    const state = this.state.clone();
    const res = f();
    this.state = state;
    return res;
  }

  tsTryParseAndCatch(f) {
    const state = this.state.clone();
    try {
      return f();
    } catch (e) {
      if (e instanceof SyntaxError) {
        this.state = state;
        return undefined;
      }
      throw e;
    }
  }

  tsTryParse(f) {
    const state = this.state.clone();
    const result = f();
    if (result !== undefined && result !== false) {
      return result;
    } else {
      this.state = state;
      return undefined;
    }
  }

  nodeWithSamePosition(original, type) {
    const node = this.startNodeAtNode(original);
    node.type = type;
    node.end = original.end;
    node.loc.end = original.loc.end;

    if (original.leadingComments) node.leadingComments = original.leadingComments;
    if (original.trailingComments) node.trailingComments = original.trailingComments;
    if (original.innerComments) node.innerComments = original.innerComments;

    return node;
  }

  tsTryParseDeclare(nany) {
    switch (this.state.type) {
      case (_types || _load_types()).types._function:
        this.next();
        return this.parseFunction(nany, /* isStatement */true);
      case (_types || _load_types()).types._class:
        return this.parseClass(nany,
        /* isStatement */true,
        /* optionalId */false);
      case (_types || _load_types()).types._const:
        if (this.match((_types || _load_types()).types._const) && this.lookaheadIsContextual("enum")) {
          // `const enum = 0;` not allowed because "enum" is a strict mode reserved word.
          this.expect((_types || _load_types()).types._const);
          this.expectContextual("enum");
          return this.tsParseEnumDeclaration(nany, /* isConst */true);
        }
      // falls through
      case (_types || _load_types()).types._var:
      case (_types || _load_types()).types._let:
        return this.parseVarStatement(nany, this.state.type);
      case (_types || _load_types()).types.name:
        {
          const value = this.state.value;
          if (value === "global") {
            return this.tsParseAmbientExternalModuleDeclaration(nany);
          } else {
            return this.tsParseDeclaration(nany, value, /* next */true);
          }
        }
    }
  }

  lookaheadIsContextual(name) {
    const l = this.lookahead();
    return l.type === (_types || _load_types()).types.name && l.value === name;
  }

  // Note: this won't be called unless the keyword is allowed in `shouldParseExportDeclaration`.
  tsTryParseExportDeclaration() {
    return this.tsParseDeclaration(this.startNode(), this.state.value,
    /* next */true);
  }

  tsParseExpressionStatement(node, expr) {
    switch (expr.name) {
      case "declare":
        {
          const declaration = this.tsTryParseDeclare(node);
          if (declaration) {
            declaration.declare = true;
            return declaration;
          }
          break;
        }
      case "global":
        // `global { }` (with no `declare`) may appear inside an ambient module declaration.
        // Would like to use tsParseAmbientExternalModuleDeclaration here, but already ran past "global".
        if (this.match((_types || _load_types()).types.braceL)) {
          const mod = node;
          mod.global = true;
          mod.id = expr;
          mod.body = this.tsParseModuleBlock();
          return this.finishNode(mod, "TSModuleDeclaration");
        }
        break;

      default:
        return this.tsParseDeclaration(node, expr.name, /* next */false);
    }
  }

  // Common to tsTryParseDeclare, tsTryParseExportDeclaration, and tsParseExpressionStatement.
  tsParseDeclaration(node, value, next) {
    switch (value) {
      case "abstract":
        if (next || this.match((_types || _load_types()).types._class)) {
          const cls = node;
          cls.abstract = true;
          if (next) this.next();
          return this.parseClass(cls,
          /* isStatement */true,
          /* optionalId */false);
        }
        break;

      case "enum":
        if (next || this.match((_types || _load_types()).types.name)) {
          if (next) this.next();
          return this.tsParseEnumDeclaration(node, /* isConst */false);
        }
        break;

      case "interface":
        if (next || this.match((_types || _load_types()).types.name)) {
          if (next) this.next();
          return this.tsParseInterfaceDeclaration(node);
        }
        break;

      case "module":
        if (next) this.next();
        if (this.match((_types || _load_types()).types.string)) {
          return this.tsParseAmbientExternalModuleDeclaration(node);
        } else if (next || this.match((_types || _load_types()).types.name)) {
          return this.tsParseModuleOrNamespaceDeclaration(node);
        }
        break;

      case "namespace":
        if (next || this.match((_types || _load_types()).types.name)) {
          if (next) this.next();
          return this.tsParseModuleOrNamespaceDeclaration(node);
        }
        break;

      case "type":
        if (next || this.match((_types || _load_types()).types.name)) {
          if (next) this.next();
          return this.tsParseTypeAliasDeclaration(node);
        }
        break;
    }
  }

  tsTryParseGenericAsyncArrowFunction(startPos, startLoc) {
    const res = this.tsTryParseAndCatch(() => {
      const node = this.startNodeAt(startPos, startLoc);
      node.typeParameters = this.tsParseTypeParameters();
      // Don't use overloaded parseFunctionParams which would look for "<" again.
      super.parseFunctionParams(node);
      node.returnType = this.tsTryParseTypeOrTypePredicateAnnotation();
      this.expect((_types || _load_types()).types.arrow);
      return node;
    });

    if (!res) {
      return undefined;
    }

    res.id = null;
    res.generator = false;
    res.expression = true; // May be set again by parseFunctionBody.
    res.async = true;
    this.parseFunctionBody(res, true);
    return this.finishNode(res, "ArrowFunctionExpression");
  }

  tsParseTypeArguments() {
    const node = this.startNode();
    this.expectRelational("<");
    node.params = this.tsParseDelimitedList("TypeParametersOrArguments", this.tsParseType.bind(this));
    this.expectRelational(">");
    return this.finishNode(node, "TypeParameterInstantiation");
  }

  // ======================================================
  // OVERRIDES
  // ======================================================

  isExportDefaultSpecifier() {
    if (this.match((_types || _load_types()).types.name) && (this.state.value === "type" || this.state.value === "interface" || this.state.value === "enum")) {
      return false;
    }

    return super.isExportDefaultSpecifier();
  }

  parseAssignableListItem(allowModifiers, decorators) {
    let accessibility;
    let readonly = false;
    if (allowModifiers) {
      accessibility = this.parseAccessModifier();
      readonly = !!this.tsParseModifier(["readonly"]);
    }

    const left = this.parseMaybeDefault();
    this.parseAssignableListItemTypes(left);
    const elt = this.parseMaybeDefault(left.start, left.loc.start, left);
    if (accessibility || readonly) {
      const pp = this.startNodeAtNode(elt);
      if (decorators.length) {
        pp.decorators = decorators;
      }
      if (accessibility) pp.accessibility = accessibility;
      if (readonly) pp.readonly = readonly;
      if (elt.type !== "Identifier" && elt.type !== "AssignmentPattern") {
        throw this.raise(pp.start, "A parameter property may not be declared using a binding pattern.");
      }
      pp.parameter = elt;
      return this.finishNode(pp, "TSParameterProperty");
    } else {
      if (decorators.length) {
        left.decorators = decorators;
      }
      return elt;
    }
  }

  parseFunctionBodyAndFinish(node, type, allowExpressionBody) {
    // For arrow functions, `parseArrow` handles the return type itself.
    if (!allowExpressionBody && this.match((_types || _load_types()).types.colon)) {
      node.returnType = this.tsParseTypeOrTypePredicateAnnotation((_types || _load_types()).types.colon);
    }

    const bodilessType = type === "FunctionDeclaration" ? "TSDeclareFunction" : type === "ClassMethod" ? "TSDeclareMethod" : undefined;
    if (bodilessType && !this.match((_types || _load_types()).types.braceL) && this.isLineTerminator()) {
      this.finishNode(node, bodilessType);
      return;
    }

    super.parseFunctionBodyAndFinish(node, type, allowExpressionBody);
  }

  parseSubscript(base, startPos, startLoc, noCalls, state) {
    if (this.eat((_types || _load_types()).types.bang)) {
      const nonNullExpression = this.startNodeAt(startPos, startLoc);
      nonNullExpression.expression = base;
      return this.finishNode(nonNullExpression, "TSNonNullExpression");
    }

    if (!noCalls && this.isRelational("<")) {
      if (this.atPossibleAsync(base)) {
        // Almost certainly this is a generic async function `async <T>() => ...
        // But it might be a call with a type argument `async<T>();`
        const asyncArrowFn = this.tsTryParseGenericAsyncArrowFunction(startPos, startLoc);
        if (asyncArrowFn) {
          return asyncArrowFn;
        }
      }

      const node = this.startNodeAt(startPos, startLoc);
      node.callee = base;

      // May be passing type arguments. But may just be the `<` operator.
      const typeArguments = this.tsTryParseTypeArgumentsInExpression(); // Also eats the "("
      if (typeArguments) {
        // possibleAsync always false here, because we would have handled it above.
        // $FlowIgnore (won't be any undefined arguments)
        node.arguments = this.parseCallExpressionArguments((_types || _load_types()).types.parenR,
        /* possibleAsync */false);
        node.typeParameters = typeArguments;
        return this.finishCallExpression(node);
      }
    }

    return super.parseSubscript(base, startPos, startLoc, noCalls, state);
  }

  parseNewArguments(node) {
    if (this.isRelational("<")) {
      // tsTryParseAndCatch is expensive, so avoid if not necessary.
      // 99% certain this is `new C<T>();`. But may be `new C < T;`, which is also legal.
      const typeParameters = this.tsTryParseAndCatch(() => {
        const args = this.tsParseTypeArguments();
        if (!this.match((_types || _load_types()).types.parenL)) this.unexpected();
        return args;
      });
      if (typeParameters) {
        node.typeParameters = typeParameters;
      }
    }

    super.parseNewArguments(node);
  }

  parseExprOp(left, leftStartPos, leftStartLoc, minPrec, noIn) {
    if (nonNull((_types || _load_types()).types._in.binop) > minPrec && !this.hasPrecedingLineBreak() && this.eatContextual("as")) {
      const node = this.startNodeAt(leftStartPos, leftStartLoc);
      node.expression = left;
      node.typeAnnotation = this.tsParseType();
      this.finishNode(node, "TSAsExpression");
      return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, noIn);
    }

    return super.parseExprOp(left, leftStartPos, leftStartLoc, minPrec, noIn);
  }

  checkReservedWord(word, startLoc, checkKeywords,
  // eslint-disable-next-line no-unused-vars
  isBinding) {}
  // Don't bother checking for TypeScript code.
  // Strict mode words may be allowed as in `declare namespace N { const static: number; }`.
  // And we have a type checker anyway, so don't bother having the parser do it.


  /*
  Don't bother doing this check in TypeScript code because:
  1. We may have a nested export statement with the same name:
    export const x = 0;
    export namespace N {
      export const x = 1;
    }
  2. We have a type checker to warn us about this sort of thing.
  */
  checkDuplicateExports() {}

  parseImport(node) {
    if (this.match((_types || _load_types()).types.name) && this.lookahead().type === (_types || _load_types()).types.eq) {
      return this.tsParseImportEqualsDeclaration(node);
    }
    return super.parseImport(node);
  }

  parseExport(node) {
    if (this.match((_types || _load_types()).types._import)) {
      // `export import A = B;`
      this.expect((_types || _load_types()).types._import);
      return this.tsParseImportEqualsDeclaration(node, /* isExport */true);
    } else if (this.eat((_types || _load_types()).types.eq)) {
      // `export = x;`
      const assign = node;
      assign.expression = this.parseExpression();
      this.semicolon();
      return this.finishNode(assign, "TSExportAssignment");
    } else if (this.eatContextual("as")) {
      // `export as namespace A;`
      const decl = node;
      // See `parseNamespaceExportDeclaration` in TypeScript's own parser
      this.expectContextual("namespace");
      decl.id = this.parseIdentifier();
      this.semicolon();
      return this.finishNode(decl, "TSNamespaceExportDeclaration");
    } else {
      return super.parseExport(node);
    }
  }

  parseStatementContent(declaration, topLevel) {
    if (this.state.type === (_types || _load_types()).types._const) {
      const ahead = this.lookahead();
      if (ahead.type === (_types || _load_types()).types.name && ahead.value === "enum") {
        const node = this.startNode();
        this.expect((_types || _load_types()).types._const);
        this.expectContextual("enum");
        return this.tsParseEnumDeclaration(node, /* isConst */true);
      }
    }
    return super.parseStatementContent(declaration, topLevel);
  }

  parseAccessModifier() {
    return this.tsParseModifier(["public", "protected", "private"]);
  }

  parseClassMember(classBody, member, state) {
    const accessibility = this.parseAccessModifier();
    if (accessibility) member.accessibility = accessibility;

    super.parseClassMember(classBody, member, state);
  }

  parseClassMemberWithIsStatic(classBody, member, state, isStatic) {
    const methodOrProp = member;
    const prop = member;
    const propOrIdx = member;

    let abstract = false,
        readonly = false;

    const mod = this.tsParseModifier(["abstract", "readonly"]);
    switch (mod) {
      case "readonly":
        readonly = true;
        abstract = !!this.tsParseModifier(["abstract"]);
        break;
      case "abstract":
        abstract = true;
        readonly = !!this.tsParseModifier(["readonly"]);
        break;
    }

    if (abstract) methodOrProp.abstract = true;
    if (readonly) propOrIdx.readonly = true;

    if (!abstract && !isStatic && !methodOrProp.accessibility) {
      const idx = this.tsTryParseIndexSignature(member);
      if (idx) {
        classBody.body.push(idx);
        return;
      }
    }

    if (readonly) {
      // Must be a property (if not an index signature).
      methodOrProp.static = isStatic;
      this.parseClassPropertyName(prop);
      this.parsePostMemberNameModifiers(methodOrProp);
      this.pushClassProperty(classBody, prop);
      return;
    }

    super.parseClassMemberWithIsStatic(classBody, member, state, isStatic);
  }

  parsePostMemberNameModifiers(methodOrProp) {
    const optional = this.eat((_types || _load_types()).types.question);
    if (optional) methodOrProp.optional = true;
  }

  // Note: The reason we do this in `parseExpressionStatement` and not `parseStatement`
  // is that e.g. `type()` is valid JS, so we must try parsing that first.
  // If it's really a type, we will parse `type` as the statement, and can correct it here
  // by parsing the rest.
  parseExpressionStatement(node, expr) {
    const decl = expr.type === "Identifier" ? this.tsParseExpressionStatement(node, expr) : undefined;
    return decl || super.parseExpressionStatement(node, expr);
  }

  // export type
  // Should be true for anything parsed by `tsTryParseExportDeclaration`.
  shouldParseExportDeclaration() {
    if (this.match((_types || _load_types()).types.name)) {
      switch (this.state.value) {
        case "abstract":
        case "declare":
        case "enum":
        case "interface":
        case "module":
        case "namespace":
        case "type":
          return true;
      }
    }
    return super.shouldParseExportDeclaration();
  }

  // An apparent conditional expression could actually be an optional parameter in an arrow function.
  parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos) {
    // only do the expensive clone if there is a question mark
    // and if we come from inside parens
    if (!refNeedsArrowPos || !this.match((_types || _load_types()).types.question)) {
      return super.parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos);
    }

    const state = this.state.clone();
    try {
      return super.parseConditional(expr, noIn, startPos, startLoc);
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        // istanbul ignore next: no such error is expected
        throw err;
      }

      this.state = state;
      refNeedsArrowPos.start = err.pos || this.state.start;
      return expr;
    }
  }

  // Note: These "type casts" are *not* valid TS expressions.
  // But we parse them here and change them when completing the arrow function.
  parseParenItem(node, startPos, startLoc) {
    node = super.parseParenItem(node, startPos, startLoc);
    if (this.eat((_types || _load_types()).types.question)) {
      node.optional = true;
    }

    if (this.match((_types || _load_types()).types.colon)) {
      const typeCastNode = this.startNodeAt(startPos, startLoc);
      typeCastNode.expression = node;
      typeCastNode.typeAnnotation = this.tsParseTypeAnnotation();

      return this.finishNode(typeCastNode, "TypeCastExpression");
    }

    return node;
  }

  parseExportDeclaration(node) {
    // "export declare" is equivalent to just "export".
    const isDeclare = this.eatContextual("declare");

    let declaration;
    if (this.match((_types || _load_types()).types.name)) {
      declaration = this.tsTryParseExportDeclaration();
    }
    if (!declaration) {
      declaration = super.parseExportDeclaration(node);
    }

    if (declaration && isDeclare) {
      declaration.declare = true;
    }

    return declaration;
  }

  parseClassId(node, isStatement, optionalId) {
    if ((!isStatement || optionalId) && this.isContextual("implements")) {
      return;
    }

    super.parseClassId(...arguments);
    const typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) node.typeParameters = typeParameters;
  }

  parseClassProperty(node) {
    const type = this.tsTryParseTypeAnnotation();
    if (type) node.typeAnnotation = type;
    return super.parseClassProperty(node);
  }

  parseClassMethod(classBody, method, isGenerator, isAsync, isConstructor) {
    const typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) method.typeParameters = typeParameters;
    super.parseClassMethod(classBody, method, isGenerator, isAsync, isConstructor);
  }

  parseClassSuper(node) {
    super.parseClassSuper(node);
    if (node.superClass && this.isRelational("<")) {
      node.superTypeParameters = this.tsParseTypeArguments();
    }
    if (this.eatContextual("implements")) {
      node.implements = this.tsParseHeritageClause();
    }
  }

  parseObjPropValue(prop, ...args) {
    if (this.isRelational("<")) {
      throw new Error("TODO");
    }

    super.parseObjPropValue(prop, ...args);
  }

  parseFunctionParams(node) {
    const typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) node.typeParameters = typeParameters;
    super.parseFunctionParams(node);
  }

  // `let x: number;`
  parseVarHead(decl) {
    super.parseVarHead(decl);
    const type = this.tsTryParseTypeAnnotation();
    if (type) {
      decl.id.typeAnnotation = type;
      this.finishNode(decl.id, decl.id.type); // set end position to end of type
    }
  }

  // parse the return type of an async arrow function - let foo = (async (): number => {});
  parseAsyncArrowFromCallExpression(node, call) {
    if (this.match((_types || _load_types()).types.colon)) {
      node.returnType = this.tsParseTypeAnnotation();
    }
    return super.parseAsyncArrowFromCallExpression(node, call);
  }

  parseMaybeAssign(...args) {
    // Note: When the JSX plugin is on, type assertions (`<T> x`) aren't valid syntax.

    let jsxError;

    if (this.match((_types || _load_types()).types.jsxTagStart)) {
      const context = this.curContext();
      assert(context === (_context || _load_context()).types.j_oTag);
      // Only time j_oTag is pushed is right after j_expr.
      assert(this.state.context[this.state.context.length - 2] === (_context || _load_context()).types.j_expr);

      // Prefer to parse JSX if possible. But may be an arrow fn.
      const state = this.state.clone();
      try {
        return super.parseMaybeAssign(...args);
      } catch (err) {
        if (!(err instanceof SyntaxError)) {
          // istanbul ignore next: no such error is expected
          throw err;
        }

        this.state = state;
        // Pop the context added by the jsxTagStart.
        assert(this.curContext() === (_context || _load_context()).types.j_oTag);
        this.state.context.pop();
        assert(this.curContext() === (_context || _load_context()).types.j_expr);
        this.state.context.pop();
        jsxError = err;
      }
    }

    if (jsxError === undefined && !this.isRelational("<")) {
      return super.parseMaybeAssign(...args);
    }

    // Either way, we're looking at a '<': tt.jsxTagStart or relational.

    let arrowExpression;
    let typeParameters;
    const state = this.state.clone();
    try {
      // This is similar to TypeScript's `tryParseParenthesizedArrowFunctionExpression`.
      typeParameters = this.tsParseTypeParameters();
      arrowExpression = super.parseMaybeAssign(...args);
      if (arrowExpression.type !== "ArrowFunctionExpression") {
        this.unexpected(); // Go to the catch block (needs a SyntaxError).
      }
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        // istanbul ignore next: no such error is expected
        throw err;
      }

      if (jsxError) {
        throw jsxError;
      }

      // Try parsing a type cast instead of an arrow function.
      // This will never happen outside of JSX.
      // (Because in JSX the '<' should be a jsxTagStart and not a relational.
      assert(!this.hasPlugin("jsx"));
      // Parsing an arrow function failed, so try a type cast.
      this.state = state;
      // This will start with a type assertion (via parseMaybeUnary).
      // But don't directly call `this.tsParseTypeAssertion` because we want to handle any binary after it.
      return super.parseMaybeAssign(...args);
    }

    // Correct TypeScript code should have at least 1 type parameter, but don't crash on bad code.
    if (typeParameters && typeParameters.params.length !== 0) {
      this.resetStartLocationFromNode(arrowExpression, typeParameters.params[0]);
    }
    arrowExpression.typeParameters = typeParameters;
    return arrowExpression;
  }

  // Handle type assertions
  parseMaybeUnary(refShorthandDefaultPos) {
    if (!this.hasPlugin("jsx") && this.eatRelational("<")) {
      return this.tsParseTypeAssertion();
    } else {
      return super.parseMaybeUnary(refShorthandDefaultPos);
    }
  }

  parseArrow(node) {
    if (this.match((_types || _load_types()).types.colon)) {
      // This is different from how the TS parser does it.
      // TS uses lookahead. Babylon parses it as a parenthesized expression and converts.
      const state = this.state.clone();
      try {
        const returnType = this.tsParseTypeOrTypePredicateAnnotation((_types || _load_types()).types.colon);
        if (this.canInsertSemicolon()) this.unexpected();
        if (!this.match((_types || _load_types()).types.arrow)) this.unexpected();
        node.returnType = returnType;
      } catch (err) {
        if (err instanceof SyntaxError) {
          this.state = state;
        } else {
          // istanbul ignore next: no such error is expected
          throw err;
        }
      }
    }

    return super.parseArrow(node);
  }

  // Allow type annotations inside of a parameter list.
  parseAssignableListItemTypes(param) {
    if (this.eat((_types || _load_types()).types.question)) {
      if (param.type !== "Identifier") {
        throw this.raise(param.start, "A binding pattern parameter cannot be optional in an implementation signature.");
      }

      param.optional = true;
    }
    const type = this.tsTryParseTypeAnnotation();
    if (type) param.typeAnnotation = type;
    return this.finishNode(param, param.type);
  }

  toAssignable(node, isBinding, contextDescription) {
    switch (node.type) {
      case "TypeCastExpression":
        return super.toAssignable(this.typeCastToParameter(node), isBinding, contextDescription);
      case "TSParameterProperty":
        return super.toAssignable(node, isBinding, contextDescription);
      default:
        return super.toAssignable(node, isBinding, contextDescription);
    }
  }

  checkLVal(expr, isBinding, checkClashes, contextDescription) {
    switch (expr.type) {
      case "TypeCastExpression":
        // Allow "typecasts" to appear on the left of assignment expressions,
        // because it may be in an arrow function.
        // e.g. `const f = (foo: number = 0) => foo;`
        return;
      case "TSParameterProperty":
        this.checkLVal(expr.parameter, isBinding, checkClashes, "parameter property");
        return;
      default:
        super.checkLVal(expr, isBinding, checkClashes, contextDescription);
        return;
    }
  }

  parseBindingAtom() {
    switch (this.state.type) {
      case (_types || _load_types()).types._this:
        // "this" may be the name of a parameter, so allow it.
        return this.parseIdentifier( /* liberal */true);
      default:
        return super.parseBindingAtom();
    }
  }

  // === === === === === === === === === === === === === === === ===
  // Note: All below methods are duplicates of something in flow.js.
  // Not sure what the best way to combine these is.
  // === === === === === === === === === === === === === === === ===

  isClassMethod() {
    return this.isRelational("<") || super.isClassMethod();
  }

  isClassProperty() {
    return this.match((_types || _load_types()).types.colon) || super.isClassProperty();
  }

  parseMaybeDefault(...args) {
    const node = super.parseMaybeDefault(...args);

    if (node.type === "AssignmentPattern" && node.typeAnnotation && node.right.start < node.typeAnnotation.start) {
      this.raise(node.typeAnnotation.start, "Type annotations must come before default assignments, " + "e.g. instead of `age = 25: number` use `age: number = 25`");
    }

    return node;
  }

  // ensure that inside types, we bypass the jsx parser plugin
  readToken(code) {
    if (this.state.inType && (code === 62 || code === 60)) {
      return this.finishOp((_types || _load_types()).types.relational, 1);
    } else {
      return super.readToken(code);
    }
  }

  toAssignableList(exprList, isBinding, contextDescription) {
    for (let i = 0; i < exprList.length; i++) {
      const expr = exprList[i];
      if (expr && expr.type === "TypeCastExpression") {
        exprList[i] = this.typeCastToParameter(expr);
      }
    }
    return super.toAssignableList(exprList, isBinding, contextDescription);
  }

  typeCastToParameter(node) {
    node.expression.typeAnnotation = node.typeAnnotation;

    return this.finishNodeAt(node.expression, node.expression.type, node.typeAnnotation.end, node.typeAnnotation.loc.end);
  }

  toReferencedList(exprList) {
    for (let i = 0; i < exprList.length; i++) {
      const expr = exprList[i];
      if (expr && expr._exprListItem && expr.type === "TypeCastExpression") {
        this.raise(expr.start, "Did not expect a type annotation here.");
      }
    }

    return exprList;
  }

  shouldParseArrow() {
    return this.match((_types || _load_types()).types.colon) || super.shouldParseArrow();
  }

  shouldParseAsyncArrow() {
    return this.match((_types || _load_types()).types.colon) || super.shouldParseAsyncArrow();
  }
};

module.exports = exports["default"];