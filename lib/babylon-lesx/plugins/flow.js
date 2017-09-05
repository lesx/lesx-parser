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

const primitiveTypes = ["any", "mixed", "empty", "bool", "boolean", "number", "string", "void", "null"]; /* eslint max-len: 0 */

function isEsModuleType(bodyElement) {
  return bodyElement.type === "DeclareExportAllDeclaration" || bodyElement.type === "DeclareExportDeclaration" && (!bodyElement.declaration || bodyElement.declaration.type !== "TypeAlias" && bodyElement.declaration.type !== "InterfaceDeclaration");
}

const exportSuggestions = {
  const: "declare export var",
  let: "declare export var",
  type: "export type",
  interface: "export interface"
};

exports.default = superClass => class extends superClass {
  flowParseTypeInitialiser(tok) {
    const oldInType = this.state.inType;
    this.state.inType = true;
    this.expect(tok || (_types || _load_types()).types.colon);

    const type = this.flowParseType();
    this.state.inType = oldInType;
    return type;
  }

  flowParsePredicate() {
    const node = this.startNode();
    const moduloLoc = this.state.startLoc;
    const moduloPos = this.state.start;
    this.expect((_types || _load_types()).types.modulo);
    const checksLoc = this.state.startLoc;
    this.expectContextual("checks");
    // Force '%' and 'checks' to be adjacent
    if (moduloLoc.line !== checksLoc.line || moduloLoc.column !== checksLoc.column - 1) {
      this.raise(moduloPos, "Spaces between ´%´ and ´checks´ are not allowed here.");
    }
    if (this.eat((_types || _load_types()).types.parenL)) {
      node.value = this.parseExpression();
      this.expect((_types || _load_types()).types.parenR);
      return this.finishNode(node, "DeclaredPredicate");
    } else {
      return this.finishNode(node, "InferredPredicate");
    }
  }

  flowParseTypeAndPredicateInitialiser() {
    const oldInType = this.state.inType;
    this.state.inType = true;
    this.expect((_types || _load_types()).types.colon);
    let type = null;
    let predicate = null;
    if (this.match((_types || _load_types()).types.modulo)) {
      this.state.inType = oldInType;
      predicate = this.flowParsePredicate();
    } else {
      type = this.flowParseType();
      this.state.inType = oldInType;
      if (this.match((_types || _load_types()).types.modulo)) {
        predicate = this.flowParsePredicate();
      }
    }
    return [type, predicate];
  }

  flowParseDeclareClass(node) {
    this.next();
    this.flowParseInterfaceish(node);
    return this.finishNode(node, "DeclareClass");
  }

  flowParseDeclareFunction(node) {
    this.next();

    const id = node.id = this.parseIdentifier();

    const typeNode = this.startNode();
    const typeContainer = this.startNode();

    if (this.isRelational("<")) {
      typeNode.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      typeNode.typeParameters = null;
    }

    this.expect((_types || _load_types()).types.parenL);
    const tmp = this.flowParseFunctionTypeParams();
    typeNode.params = tmp.params;
    typeNode.rest = tmp.rest;
    this.expect((_types || _load_types()).types.parenR);

    [
    // $FlowFixMe (destructuring not supported yet)
    typeNode.returnType,
    // $FlowFixMe (destructuring not supported yet)
    node.predicate] = this.flowParseTypeAndPredicateInitialiser();

    typeContainer.typeAnnotation = this.finishNode(typeNode, "FunctionTypeAnnotation");

    id.typeAnnotation = this.finishNode(typeContainer, "TypeAnnotation");

    this.finishNode(id, id.type);

    this.semicolon();

    return this.finishNode(node, "DeclareFunction");
  }

  flowParseDeclare(node, insideModule) {
    if (this.match((_types || _load_types()).types._class)) {
      return this.flowParseDeclareClass(node);
    } else if (this.match((_types || _load_types()).types._function)) {
      return this.flowParseDeclareFunction(node);
    } else if (this.match((_types || _load_types()).types._var)) {
      return this.flowParseDeclareVariable(node);
    } else if (this.isContextual("module")) {
      if (this.lookahead().type === (_types || _load_types()).types.dot) {
        return this.flowParseDeclareModuleExports(node);
      } else {
        if (insideModule) this.unexpected(null, "`declare module` cannot be used inside another `declare module`");
        return this.flowParseDeclareModule(node);
      }
    } else if (this.isContextual("type")) {
      return this.flowParseDeclareTypeAlias(node);
    } else if (this.isContextual("opaque")) {
      return this.flowParseDeclareOpaqueType(node);
    } else if (this.isContextual("interface")) {
      return this.flowParseDeclareInterface(node);
    } else if (this.match((_types || _load_types()).types._export)) {
      return this.flowParseDeclareExportDeclaration(node, insideModule);
    } else {
      throw this.unexpected();
    }
  }

  flowParseDeclareVariable(node) {
    this.next();
    node.id = this.flowParseTypeAnnotatableIdentifier(
    /*allowPrimitiveOverride*/true);
    this.semicolon();
    return this.finishNode(node, "DeclareVariable");
  }

  flowParseDeclareModule(node) {
    this.next();

    if (this.match((_types || _load_types()).types.string)) {
      node.id = this.parseExprAtom();
    } else {
      node.id = this.parseIdentifier();
    }

    const bodyNode = node.body = this.startNode();
    const body = bodyNode.body = [];
    this.expect((_types || _load_types()).types.braceL);
    while (!this.match((_types || _load_types()).types.braceR)) {
      let bodyNode = this.startNode();

      if (this.match((_types || _load_types()).types._import)) {
        const lookahead = this.lookahead();
        if (lookahead.value !== "type" && lookahead.value !== "typeof") {
          this.unexpected(null, "Imports within a `declare module` body must always be `import type` or `import typeof`");
        }
        this.next();
        this.parseImport(bodyNode);
      } else {
        this.expectContextual("declare", "Only declares and type imports are allowed inside declare module");

        bodyNode = this.flowParseDeclare(bodyNode, true);
      }

      body.push(bodyNode);
    }
    this.expect((_types || _load_types()).types.braceR);

    this.finishNode(bodyNode, "BlockStatement");

    let kind = null;
    let hasModuleExport = false;
    const errorMessage = "Found both `declare module.exports` and `declare export` in the same module. Modules can only have 1 since they are either an ES module or they are a CommonJS module";
    body.forEach(bodyElement => {
      if (isEsModuleType(bodyElement)) {
        if (kind === "CommonJS") this.unexpected(bodyElement.start, errorMessage);
        kind = "ES";
      } else if (bodyElement.type === "DeclareModuleExports") {
        if (hasModuleExport) this.unexpected(bodyElement.start, "Duplicate `declare module.exports` statement");
        if (kind === "ES") this.unexpected(bodyElement.start, errorMessage);
        kind = "CommonJS";
        hasModuleExport = true;
      }
    });

    node.kind = kind || "CommonJS";
    return this.finishNode(node, "DeclareModule");
  }

  flowParseDeclareExportDeclaration(node, insideModule) {
    this.expect((_types || _load_types()).types._export);

    if (this.eat((_types || _load_types()).types._default)) {
      if (this.match((_types || _load_types()).types._function) || this.match((_types || _load_types()).types._class)) {
        // declare export default class ...
        // declare export default function ...
        node.declaration = this.flowParseDeclare(this.startNode());
      } else {
        // declare export default [type];
        node.declaration = this.flowParseType();
        this.semicolon();
      }
      node.default = true;

      return this.finishNode(node, "DeclareExportDeclaration");
    } else {
      if (this.match((_types || _load_types()).types._const) || this.match((_types || _load_types()).types._let) || (this.isContextual("type") || this.isContextual("interface")) && !insideModule) {
        const label = this.state.value;
        const suggestion = exportSuggestions[label];
        this.unexpected(this.state.start, `\`declare export ${label}\` is not supported. Use \`${suggestion}\` instead`);
      }

      if (this.match((_types || _load_types()).types._var) || // declare export var ...
      this.match((_types || _load_types()).types._function) || // declare export function ...
      this.match((_types || _load_types()).types._class) || // declare export class ...
      this.isContextual("opaque") // declare export opaque ..
      ) {
          node.declaration = this.flowParseDeclare(this.startNode());
          node.default = false;

          return this.finishNode(node, "DeclareExportDeclaration");
        } else if (this.match((_types || _load_types()).types.star) || // declare export * from ''
      this.match((_types || _load_types()).types.braceL) || // declare export {} ...
      this.isContextual("interface") || // declare export interface ...
      this.isContextual("type") || // declare export type ...
      this.isContextual("opaque") // declare export opaque type ...
      ) {
          node = this.parseExport(node);
          if (node.type === "ExportNamedDeclaration") {
            // flow does not support the ExportNamedDeclaration
            // $FlowIgnore
            node.type = "ExportDeclaration";
            // $FlowFixMe
            node.default = false;
            delete node.exportKind;
          }

          // $FlowIgnore
          node.type = "Declare" + node.type;

          return node;
        }
    }

    throw this.unexpected();
  }

  flowParseDeclareModuleExports(node) {
    this.expectContextual("module");
    this.expect((_types || _load_types()).types.dot);
    this.expectContextual("exports");
    node.typeAnnotation = this.flowParseTypeAnnotation();
    this.semicolon();

    return this.finishNode(node, "DeclareModuleExports");
  }

  flowParseDeclareTypeAlias(node) {
    this.next();
    this.flowParseTypeAlias(node);
    return this.finishNode(node, "DeclareTypeAlias");
  }

  flowParseDeclareOpaqueType(node) {
    this.next();
    this.flowParseOpaqueType(node, true);
    return this.finishNode(node, "DeclareOpaqueType");
  }

  flowParseDeclareInterface(node) {
    this.next();
    this.flowParseInterfaceish(node);
    return this.finishNode(node, "DeclareInterface");
  }

  // Interfaces

  flowParseInterfaceish(node) {
    node.id = this.parseIdentifier();

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      node.typeParameters = null;
    }

    node.extends = [];
    node.mixins = [];

    if (this.eat((_types || _load_types()).types._extends)) {
      do {
        node.extends.push(this.flowParseInterfaceExtends());
      } while (this.eat((_types || _load_types()).types.comma));
    }

    if (this.isContextual("mixins")) {
      this.next();
      do {
        node.mixins.push(this.flowParseInterfaceExtends());
      } while (this.eat((_types || _load_types()).types.comma));
    }

    node.body = this.flowParseObjectType(true, false, false);
  }

  flowParseInterfaceExtends() {
    const node = this.startNode();

    node.id = this.flowParseQualifiedTypeIdentifier();
    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterInstantiation();
    } else {
      node.typeParameters = null;
    }

    return this.finishNode(node, "InterfaceExtends");
  }

  flowParseInterface(node) {
    this.flowParseInterfaceish(node);
    return this.finishNode(node, "InterfaceDeclaration");
  }

  flowParseRestrictedIdentifier(liberal) {
    if (primitiveTypes.indexOf(this.state.value) > -1) {
      this.raise(this.state.start, `Cannot overwrite primitive type ${this.state.value}`);
    }

    return this.parseIdentifier(liberal);
  }

  // Type aliases

  flowParseTypeAlias(node) {
    node.id = this.flowParseRestrictedIdentifier();

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      node.typeParameters = null;
    }

    node.right = this.flowParseTypeInitialiser((_types || _load_types()).types.eq);
    this.semicolon();

    return this.finishNode(node, "TypeAlias");
  }

  flowParseOpaqueType(node, declare) {
    this.expectContextual("type");
    node.id = this.flowParseRestrictedIdentifier();

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      node.typeParameters = null;
    }

    // Parse the supertype
    node.supertype = null;
    if (this.match((_types || _load_types()).types.colon)) {
      node.supertype = this.flowParseTypeInitialiser((_types || _load_types()).types.colon);
    }

    node.impltype = null;
    if (!declare) {
      node.impltype = this.flowParseTypeInitialiser((_types || _load_types()).types.eq);
    }
    this.semicolon();

    return this.finishNode(node, "OpaqueType");
  }

  // Type annotations

  flowParseTypeParameter() {
    const node = this.startNode();

    const variance = this.flowParseVariance();

    const ident = this.flowParseTypeAnnotatableIdentifier();
    node.name = ident.name;
    node.variance = variance;
    node.bound = ident.typeAnnotation;

    if (this.match((_types || _load_types()).types.eq)) {
      this.eat((_types || _load_types()).types.eq);
      node.default = this.flowParseType();
    }

    return this.finishNode(node, "TypeParameter");
  }

  flowParseTypeParameterDeclaration() {
    const oldInType = this.state.inType;
    const node = this.startNode();
    node.params = [];

    this.state.inType = true;

    // istanbul ignore else: this condition is already checked at all call sites
    if (this.isRelational("<") || this.match((_types || _load_types()).types.jsxTagStart)) {
      this.next();
    } else {
      this.unexpected();
    }

    do {
      node.params.push(this.flowParseTypeParameter());
      if (!this.isRelational(">")) {
        this.expect((_types || _load_types()).types.comma);
      }
    } while (!this.isRelational(">"));
    this.expectRelational(">");

    this.state.inType = oldInType;

    return this.finishNode(node, "TypeParameterDeclaration");
  }

  flowParseTypeParameterInstantiation() {
    const node = this.startNode();
    const oldInType = this.state.inType;
    node.params = [];

    this.state.inType = true;

    this.expectRelational("<");
    while (!this.isRelational(">")) {
      node.params.push(this.flowParseType());
      if (!this.isRelational(">")) {
        this.expect((_types || _load_types()).types.comma);
      }
    }
    this.expectRelational(">");

    this.state.inType = oldInType;

    return this.finishNode(node, "TypeParameterInstantiation");
  }

  flowParseObjectPropertyKey() {
    return this.match((_types || _load_types()).types.num) || this.match((_types || _load_types()).types.string) ? this.parseExprAtom() : this.parseIdentifier(true);
  }

  flowParseObjectTypeIndexer(node, isStatic, variance) {
    node.static = isStatic;

    this.expect((_types || _load_types()).types.bracketL);
    if (this.lookahead().type === (_types || _load_types()).types.colon) {
      node.id = this.flowParseObjectPropertyKey();
      node.key = this.flowParseTypeInitialiser();
    } else {
      node.id = null;
      node.key = this.flowParseType();
    }
    this.expect((_types || _load_types()).types.bracketR);
    node.value = this.flowParseTypeInitialiser();
    node.variance = variance;

    return this.finishNode(node, "ObjectTypeIndexer");
  }

  flowParseObjectTypeMethodish(node) {
    node.params = [];
    node.rest = null;
    node.typeParameters = null;

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    }

    this.expect((_types || _load_types()).types.parenL);
    while (!this.match((_types || _load_types()).types.parenR) && !this.match((_types || _load_types()).types.ellipsis)) {
      node.params.push(this.flowParseFunctionTypeParam());
      if (!this.match((_types || _load_types()).types.parenR)) {
        this.expect((_types || _load_types()).types.comma);
      }
    }

    if (this.eat((_types || _load_types()).types.ellipsis)) {
      node.rest = this.flowParseFunctionTypeParam();
    }
    this.expect((_types || _load_types()).types.parenR);
    node.returnType = this.flowParseTypeInitialiser();

    return this.finishNode(node, "FunctionTypeAnnotation");
  }

  flowParseObjectTypeCallProperty(node, isStatic) {
    const valueNode = this.startNode();
    node.static = isStatic;
    node.value = this.flowParseObjectTypeMethodish(valueNode);
    return this.finishNode(node, "ObjectTypeCallProperty");
  }

  flowParseObjectType(allowStatic, allowExact, allowSpread) {
    const oldInType = this.state.inType;
    this.state.inType = true;

    const nodeStart = this.startNode();

    nodeStart.callProperties = [];
    nodeStart.properties = [];
    nodeStart.indexers = [];

    let endDelim;
    let exact;
    if (allowExact && this.match((_types || _load_types()).types.braceBarL)) {
      this.expect((_types || _load_types()).types.braceBarL);
      endDelim = (_types || _load_types()).types.braceBarR;
      exact = true;
    } else {
      this.expect((_types || _load_types()).types.braceL);
      endDelim = (_types || _load_types()).types.braceR;
      exact = false;
    }

    nodeStart.exact = exact;

    while (!this.match(endDelim)) {
      let isStatic = false;
      const node = this.startNode();
      if (allowStatic && this.isContextual("static") && this.lookahead().type !== (_types || _load_types()).types.colon) {
        this.next();
        isStatic = true;
      }

      const variance = this.flowParseVariance();

      if (this.match((_types || _load_types()).types.bracketL)) {
        nodeStart.indexers.push(this.flowParseObjectTypeIndexer(node, isStatic, variance));
      } else if (this.match((_types || _load_types()).types.parenL) || this.isRelational("<")) {
        if (variance) {
          this.unexpected(variance.start);
        }
        nodeStart.callProperties.push(this.flowParseObjectTypeCallProperty(node, isStatic));
      } else {
        let kind = "init";

        if (this.isContextual("get") || this.isContextual("set")) {
          const lookahead = this.lookahead();
          if (lookahead.type === (_types || _load_types()).types.name || lookahead.type === (_types || _load_types()).types.string || lookahead.type === (_types || _load_types()).types.num) {
            kind = this.state.value;
            this.next();
          }
        }

        nodeStart.properties.push(this.flowParseObjectTypeProperty(node, isStatic, variance, kind, allowSpread));
      }

      this.flowObjectTypeSemicolon();
    }

    this.expect(endDelim);

    const out = this.finishNode(nodeStart, "ObjectTypeAnnotation");

    this.state.inType = oldInType;

    return out;
  }

  flowParseObjectTypeProperty(node, isStatic, variance, kind, allowSpread) {
    if (this.match((_types || _load_types()).types.ellipsis)) {
      if (!allowSpread) {
        this.unexpected(null, "Spread operator cannot appear in class or interface definitions");
      }
      if (variance) {
        this.unexpected(variance.start, "Spread properties cannot have variance");
      }
      this.expect((_types || _load_types()).types.ellipsis);
      node.argument = this.flowParseType();

      return this.finishNode(node, "ObjectTypeSpreadProperty");
    } else {
      node.key = this.flowParseObjectPropertyKey();
      node.static = isStatic;
      node.kind = kind;

      let optional = false;
      if (this.isRelational("<") || this.match((_types || _load_types()).types.parenL)) {
        // This is a method property
        if (variance) {
          this.unexpected(variance.start);
        }

        node.value = this.flowParseObjectTypeMethodish(this.startNodeAt(node.start, node.loc.start));
        if (kind === "get" || kind === "set") this.flowCheckGetterSetterParamCount(node);
      } else {
        if (kind !== "init") this.unexpected();
        if (this.eat((_types || _load_types()).types.question)) {
          optional = true;
        }
        node.value = this.flowParseTypeInitialiser();
        node.variance = variance;
      }

      node.optional = optional;

      return this.finishNode(node, "ObjectTypeProperty");
    }
  }

  // This is similar to checkGetterSetterParamCount, but as
  // babylon uses non estree properties we cannot reuse it here
  flowCheckGetterSetterParamCount(property) {
    const paramCount = property.kind === "get" ? 0 : 1;
    if (property.value.params.length !== paramCount) {
      const start = property.start;
      if (property.kind === "get") {
        this.raise(start, "getter should have no params");
      } else {
        this.raise(start, "setter should have exactly one param");
      }
    }
  }

  flowObjectTypeSemicolon() {
    if (!this.eat((_types || _load_types()).types.semi) && !this.eat((_types || _load_types()).types.comma) && !this.match((_types || _load_types()).types.braceR) && !this.match((_types || _load_types()).types.braceBarR)) {
      this.unexpected();
    }
  }

  flowParseQualifiedTypeIdentifier(startPos, startLoc, id) {
    startPos = startPos || this.state.start;
    startLoc = startLoc || this.state.startLoc;
    let node = id || this.parseIdentifier();

    while (this.eat((_types || _load_types()).types.dot)) {
      const node2 = this.startNodeAt(startPos, startLoc);
      node2.qualification = node;
      node2.id = this.parseIdentifier();
      node = this.finishNode(node2, "QualifiedTypeIdentifier");
    }

    return node;
  }

  flowParseGenericType(startPos, startLoc, id) {
    const node = this.startNodeAt(startPos, startLoc);

    node.typeParameters = null;
    node.id = this.flowParseQualifiedTypeIdentifier(startPos, startLoc, id);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterInstantiation();
    }

    return this.finishNode(node, "GenericTypeAnnotation");
  }

  flowParseTypeofType() {
    const node = this.startNode();
    this.expect((_types || _load_types()).types._typeof);
    node.argument = this.flowParsePrimaryType();
    return this.finishNode(node, "TypeofTypeAnnotation");
  }

  flowParseTupleType() {
    const node = this.startNode();
    node.types = [];
    this.expect((_types || _load_types()).types.bracketL);
    // We allow trailing commas
    while (this.state.pos < this.input.length && !this.match((_types || _load_types()).types.bracketR)) {
      node.types.push(this.flowParseType());
      if (this.match((_types || _load_types()).types.bracketR)) break;
      this.expect((_types || _load_types()).types.comma);
    }
    this.expect((_types || _load_types()).types.bracketR);
    return this.finishNode(node, "TupleTypeAnnotation");
  }

  flowParseFunctionTypeParam() {
    let name = null;
    let optional = false;
    let typeAnnotation = null;
    const node = this.startNode();
    const lh = this.lookahead();
    if (lh.type === (_types || _load_types()).types.colon || lh.type === (_types || _load_types()).types.question) {
      name = this.parseIdentifier();
      if (this.eat((_types || _load_types()).types.question)) {
        optional = true;
      }
      typeAnnotation = this.flowParseTypeInitialiser();
    } else {
      typeAnnotation = this.flowParseType();
    }
    node.name = name;
    node.optional = optional;
    node.typeAnnotation = typeAnnotation;
    return this.finishNode(node, "FunctionTypeParam");
  }

  reinterpretTypeAsFunctionTypeParam(type) {
    const node = this.startNodeAt(type.start, type.loc.start);
    node.name = null;
    node.optional = false;
    node.typeAnnotation = type;
    return this.finishNode(node, "FunctionTypeParam");
  }

  flowParseFunctionTypeParams(params = []) {
    let rest = null;
    while (!this.match((_types || _load_types()).types.parenR) && !this.match((_types || _load_types()).types.ellipsis)) {
      params.push(this.flowParseFunctionTypeParam());
      if (!this.match((_types || _load_types()).types.parenR)) {
        this.expect((_types || _load_types()).types.comma);
      }
    }
    if (this.eat((_types || _load_types()).types.ellipsis)) {
      rest = this.flowParseFunctionTypeParam();
    }
    return { params, rest };
  }

  flowIdentToTypeAnnotation(startPos, startLoc, node, id) {
    switch (id.name) {
      case "any":
        return this.finishNode(node, "AnyTypeAnnotation");

      case "void":
        return this.finishNode(node, "VoidTypeAnnotation");

      case "bool":
      case "boolean":
        return this.finishNode(node, "BooleanTypeAnnotation");

      case "mixed":
        return this.finishNode(node, "MixedTypeAnnotation");

      case "empty":
        return this.finishNode(node, "EmptyTypeAnnotation");

      case "number":
        return this.finishNode(node, "NumberTypeAnnotation");

      case "string":
        return this.finishNode(node, "StringTypeAnnotation");

      default:
        return this.flowParseGenericType(startPos, startLoc, id);
    }
  }

  // The parsing of types roughly parallels the parsing of expressions, and
  // primary types are kind of like primary expressions...they're the
  // primitives with which other types are constructed.
  flowParsePrimaryType() {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const node = this.startNode();
    let tmp;
    let type;
    let isGroupedType = false;
    const oldNoAnonFunctionType = this.state.noAnonFunctionType;

    switch (this.state.type) {
      case (_types || _load_types()).types.name:
        return this.flowIdentToTypeAnnotation(startPos, startLoc, node, this.parseIdentifier());

      case (_types || _load_types()).types.braceL:
        return this.flowParseObjectType(false, false, true);

      case (_types || _load_types()).types.braceBarL:
        return this.flowParseObjectType(false, true, true);

      case (_types || _load_types()).types.bracketL:
        return this.flowParseTupleType();

      case (_types || _load_types()).types.relational:
        if (this.state.value === "<") {
          node.typeParameters = this.flowParseTypeParameterDeclaration();
          this.expect((_types || _load_types()).types.parenL);
          tmp = this.flowParseFunctionTypeParams();
          node.params = tmp.params;
          node.rest = tmp.rest;
          this.expect((_types || _load_types()).types.parenR);

          this.expect((_types || _load_types()).types.arrow);

          node.returnType = this.flowParseType();

          return this.finishNode(node, "FunctionTypeAnnotation");
        }
        break;

      case (_types || _load_types()).types.parenL:
        this.next();

        // Check to see if this is actually a grouped type
        if (!this.match((_types || _load_types()).types.parenR) && !this.match((_types || _load_types()).types.ellipsis)) {
          if (this.match((_types || _load_types()).types.name)) {
            const token = this.lookahead().type;
            isGroupedType = token !== (_types || _load_types()).types.question && token !== (_types || _load_types()).types.colon;
          } else {
            isGroupedType = true;
          }
        }

        if (isGroupedType) {
          this.state.noAnonFunctionType = false;
          type = this.flowParseType();
          this.state.noAnonFunctionType = oldNoAnonFunctionType;

          // A `,` or a `) =>` means this is an anonymous function type
          if (this.state.noAnonFunctionType || !(this.match((_types || _load_types()).types.comma) || this.match((_types || _load_types()).types.parenR) && this.lookahead().type === (_types || _load_types()).types.arrow)) {
            this.expect((_types || _load_types()).types.parenR);
            return type;
          } else {
            // Eat a comma if there is one
            this.eat((_types || _load_types()).types.comma);
          }
        }

        if (type) {
          tmp = this.flowParseFunctionTypeParams([this.reinterpretTypeAsFunctionTypeParam(type)]);
        } else {
          tmp = this.flowParseFunctionTypeParams();
        }

        node.params = tmp.params;
        node.rest = tmp.rest;

        this.expect((_types || _load_types()).types.parenR);

        this.expect((_types || _load_types()).types.arrow);

        node.returnType = this.flowParseType();

        node.typeParameters = null;

        return this.finishNode(node, "FunctionTypeAnnotation");

      case (_types || _load_types()).types.string:
        return this.parseLiteral(this.state.value, "StringLiteralTypeAnnotation");

      case (_types || _load_types()).types._true:
      case (_types || _load_types()).types._false:
        node.value = this.match((_types || _load_types()).types._true);
        this.next();
        return this.finishNode(node, "BooleanLiteralTypeAnnotation");

      case (_types || _load_types()).types.plusMin:
        if (this.state.value === "-") {
          this.next();
          if (!this.match((_types || _load_types()).types.num)) this.unexpected(null, "Unexpected token, expected number");

          return this.parseLiteral(-this.state.value, "NumberLiteralTypeAnnotation", node.start, node.loc.start);
        }

        this.unexpected();
      case (_types || _load_types()).types.num:
        return this.parseLiteral(this.state.value, "NumberLiteralTypeAnnotation");

      case (_types || _load_types()).types._null:
        this.next();
        return this.finishNode(node, "NullLiteralTypeAnnotation");

      case (_types || _load_types()).types._this:
        this.next();
        return this.finishNode(node, "ThisTypeAnnotation");

      case (_types || _load_types()).types.star:
        this.next();
        return this.finishNode(node, "ExistsTypeAnnotation");

      default:
        if (this.state.type.keyword === "typeof") {
          return this.flowParseTypeofType();
        }
    }

    throw this.unexpected();
  }

  flowParsePostfixType() {
    const startPos = this.state.start,
          startLoc = this.state.startLoc;
    let type = this.flowParsePrimaryType();
    while (!this.canInsertSemicolon() && this.match((_types || _load_types()).types.bracketL)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.elementType = type;
      this.expect((_types || _load_types()).types.bracketL);
      this.expect((_types || _load_types()).types.bracketR);
      type = this.finishNode(node, "ArrayTypeAnnotation");
    }
    return type;
  }

  flowParsePrefixType() {
    const node = this.startNode();
    if (this.eat((_types || _load_types()).types.question)) {
      node.typeAnnotation = this.flowParsePrefixType();
      return this.finishNode(node, "NullableTypeAnnotation");
    } else {
      return this.flowParsePostfixType();
    }
  }

  flowParseAnonFunctionWithoutParens() {
    const param = this.flowParsePrefixType();
    if (!this.state.noAnonFunctionType && this.eat((_types || _load_types()).types.arrow)) {
      // TODO: This should be a type error. Passing in a SourceLocation, and it expects a Position.
      const node = this.startNodeAt(param.start, param.loc.start);
      node.params = [this.reinterpretTypeAsFunctionTypeParam(param)];
      node.rest = null;
      node.returnType = this.flowParseType();
      node.typeParameters = null;
      return this.finishNode(node, "FunctionTypeAnnotation");
    }
    return param;
  }

  flowParseIntersectionType() {
    const node = this.startNode();
    this.eat((_types || _load_types()).types.bitwiseAND);
    const type = this.flowParseAnonFunctionWithoutParens();
    node.types = [type];
    while (this.eat((_types || _load_types()).types.bitwiseAND)) {
      node.types.push(this.flowParseAnonFunctionWithoutParens());
    }
    return node.types.length === 1 ? type : this.finishNode(node, "IntersectionTypeAnnotation");
  }

  flowParseUnionType() {
    const node = this.startNode();
    this.eat((_types || _load_types()).types.bitwiseOR);
    const type = this.flowParseIntersectionType();
    node.types = [type];
    while (this.eat((_types || _load_types()).types.bitwiseOR)) {
      node.types.push(this.flowParseIntersectionType());
    }
    return node.types.length === 1 ? type : this.finishNode(node, "UnionTypeAnnotation");
  }

  flowParseType() {
    const oldInType = this.state.inType;
    this.state.inType = true;
    const type = this.flowParseUnionType();
    this.state.inType = oldInType;
    // Ensure that a brace after a function generic type annotation is a
    // statement, except in arrow functions (noAnonFunctionType)
    this.state.exprAllowed = this.state.exprAllowed || this.state.noAnonFunctionType;
    return type;
  }

  flowParseTypeAnnotation() {
    const node = this.startNode();
    node.typeAnnotation = this.flowParseTypeInitialiser();
    return this.finishNode(node, "TypeAnnotation");
  }

  flowParseTypeAnnotatableIdentifier(allowPrimitiveOverride) {
    const ident = allowPrimitiveOverride ? this.parseIdentifier() : this.flowParseRestrictedIdentifier();
    if (this.match((_types || _load_types()).types.colon)) {
      ident.typeAnnotation = this.flowParseTypeAnnotation();
      this.finishNode(ident, ident.type);
    }
    return ident;
  }

  typeCastToParameter(node) {
    node.expression.typeAnnotation = node.typeAnnotation;

    return this.finishNodeAt(node.expression, node.expression.type, node.typeAnnotation.end, node.typeAnnotation.loc.end);
  }

  flowParseVariance() {
    let variance = null;
    if (this.match((_types || _load_types()).types.plusMin)) {
      variance = this.startNode();
      if (this.state.value === "+") {
        variance.kind = "plus";
      } else {
        variance.kind = "minus";
      }
      this.next();
      this.finishNode(variance, "Variance");
    }
    return variance;
  }

  // ==================================
  // Overrides
  // ==================================

  parseFunctionBodyAndFinish(node, type, allowExpressionBody) {
    // For arrow functions, `parseArrow` handles the return type itself.
    if (!allowExpressionBody && this.match((_types || _load_types()).types.colon)) {
      const typeNode = this.startNode();

      [
      // $FlowFixMe (destructuring not supported yet)
      typeNode.typeAnnotation,
      // $FlowFixMe (destructuring not supported yet)
      node.predicate] = this.flowParseTypeAndPredicateInitialiser();

      node.returnType = typeNode.typeAnnotation ? this.finishNode(typeNode, "TypeAnnotation") : null;
    }

    super.parseFunctionBodyAndFinish(node, type, allowExpressionBody);
  }

  // interfaces
  parseStatement(declaration, topLevel) {
    // strict mode handling of `interface` since it's a reserved word
    if (this.state.strict && this.match((_types || _load_types()).types.name) && this.state.value === "interface") {
      const node = this.startNode();
      this.next();
      return this.flowParseInterface(node);
    } else {
      return super.parseStatement(declaration, topLevel);
    }
  }

  // declares, interfaces and type aliases
  parseExpressionStatement(node, expr) {
    if (expr.type === "Identifier") {
      if (expr.name === "declare") {
        if (this.match((_types || _load_types()).types._class) || this.match((_types || _load_types()).types.name) || this.match((_types || _load_types()).types._function) || this.match((_types || _load_types()).types._var) || this.match((_types || _load_types()).types._export)) {
          return this.flowParseDeclare(node);
        }
      } else if (this.match((_types || _load_types()).types.name)) {
        if (expr.name === "interface") {
          return this.flowParseInterface(node);
        } else if (expr.name === "type") {
          return this.flowParseTypeAlias(node);
        } else if (expr.name === "opaque") {
          return this.flowParseOpaqueType(node, false);
        }
      }
    }

    return super.parseExpressionStatement(node, expr);
  }

  // export type
  shouldParseExportDeclaration() {
    return this.isContextual("type") || this.isContextual("interface") || this.isContextual("opaque") || super.shouldParseExportDeclaration();
  }

  isExportDefaultSpecifier() {
    if (this.match((_types || _load_types()).types.name) && (this.state.value === "type" || this.state.value === "interface" || this.state.value == "opaque")) {
      return false;
    }

    return super.isExportDefaultSpecifier();
  }

  parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos) {
    // only do the expensive clone if there is a question mark
    // and if we come from inside parens
    if (refNeedsArrowPos && this.match((_types || _load_types()).types.question)) {
      const state = this.state.clone();
      try {
        return super.parseConditional(expr, noIn, startPos, startLoc);
      } catch (err) {
        if (err instanceof SyntaxError) {
          this.state = state;
          refNeedsArrowPos.start = err.pos || this.state.start;
          return expr;
        } else {
          // istanbul ignore next: no such error is expected
          throw err;
        }
      }
    }

    return super.parseConditional(expr, noIn, startPos, startLoc);
  }

  parseParenItem(node, startPos, startLoc) {
    node = super.parseParenItem(node, startPos, startLoc);
    if (this.eat((_types || _load_types()).types.question)) {
      node.optional = true;
    }

    if (this.match((_types || _load_types()).types.colon)) {
      const typeCastNode = this.startNodeAt(startPos, startLoc);
      typeCastNode.expression = node;
      typeCastNode.typeAnnotation = this.flowParseTypeAnnotation();

      return this.finishNode(typeCastNode, "TypeCastExpression");
    }

    return node;
  }

  parseExport(node) {
    node = super.parseExport(node);
    if (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
      node.exportKind = node.exportKind || "value";
    }
    return node;
  }

  parseExportDeclaration(node) {
    if (this.isContextual("type")) {
      node.exportKind = "type";

      const declarationNode = this.startNode();
      this.next();

      if (this.match((_types || _load_types()).types.braceL)) {
        // export type { foo, bar };
        node.specifiers = this.parseExportSpecifiers();
        this.parseExportFrom(node);
        return null;
      } else {
        // export type Foo = Bar;
        return this.flowParseTypeAlias(declarationNode);
      }
    } else if (this.isContextual("opaque")) {
      node.exportKind = "type";

      const declarationNode = this.startNode();
      this.next();
      // export opaque type Foo = Bar;
      return this.flowParseOpaqueType(declarationNode, false);
    } else if (this.isContextual("interface")) {
      node.exportKind = "type";
      const declarationNode = this.startNode();
      this.next();
      return this.flowParseInterface(declarationNode);
    } else {
      return super.parseExportDeclaration(node);
    }
  }

  shouldParseExportStar() {
    return super.shouldParseExportStar() || this.isContextual("type") && this.lookahead().type === (_types || _load_types()).types.star;
  }

  parseExportStar(node, allowNamed) {
    if (this.eatContextual("type")) {
      node.exportKind = "type";
      allowNamed = false;
    }

    return super.parseExportStar(node, allowNamed);
  }

  parseClassId(node, isStatement, optionalId) {
    super.parseClassId(node, isStatement, optionalId);
    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    }
  }

  // don't consider `void` to be a keyword as then it'll use the void token type
  // and set startExpr
  isKeyword(name) {
    if (this.state.inType && name === "void") {
      return false;
    } else {
      return super.isKeyword(name);
    }
  }

  // ensure that inside flow types, we bypass the jsx parser plugin
  readToken(code) {
    if (this.state.inType && (code === 62 || code === 60)) {
      return this.finishOp((_types || _load_types()).types.relational, 1);
    } else {
      return super.readToken(code);
    }
  }

  toAssignable(node, isBinding, contextDescription) {
    if (node.type === "TypeCastExpression") {
      return super.toAssignable(this.typeCastToParameter(node), isBinding, contextDescription);
    } else {
      return super.toAssignable(node, isBinding, contextDescription);
    }
  }

  // turn type casts that we found in function parameter head into type annotated params
  toAssignableList(exprList, isBinding, contextDescription) {
    for (let i = 0; i < exprList.length; i++) {
      const expr = exprList[i];
      if (expr && expr.type === "TypeCastExpression") {
        exprList[i] = this.typeCastToParameter(expr);
      }
    }
    return super.toAssignableList(exprList, isBinding, contextDescription);
  }

  // this is a list of nodes, from something like a call expression, we need to filter the
  // type casts that we've found that are illegal in this context
  toReferencedList(exprList) {
    for (let i = 0; i < exprList.length; i++) {
      const expr = exprList[i];
      if (expr && expr._exprListItem && expr.type === "TypeCastExpression") {
        this.raise(expr.start, "Unexpected type cast");
      }
    }

    return exprList;
  }

  // parse an item inside a expression list eg. `(NODE, NODE)` where NODE represents
  // the position where this function is called
  parseExprListItem(allowEmpty, refShorthandDefaultPos, refNeedsArrowPos) {
    const container = this.startNode();
    const node = super.parseExprListItem(allowEmpty, refShorthandDefaultPos, refNeedsArrowPos);
    if (this.match((_types || _load_types()).types.colon)) {
      container._exprListItem = true;
      container.expression = node;
      container.typeAnnotation = this.flowParseTypeAnnotation();
      return this.finishNode(container, "TypeCastExpression");
    } else {
      return node;
    }
  }

  checkLVal(expr, isBinding, checkClashes, contextDescription) {
    if (expr.type !== "TypeCastExpression") {
      return super.checkLVal(expr, isBinding, checkClashes, contextDescription);
    }
  }

  // parse class property type annotations
  parseClassProperty(node) {
    if (this.match((_types || _load_types()).types.colon)) {
      node.typeAnnotation = this.flowParseTypeAnnotation();
    }
    return super.parseClassProperty(node);
  }

  // determine whether or not we're currently in the position where a class method would appear
  isClassMethod() {
    return this.isRelational("<") || super.isClassMethod();
  }

  // determine whether or not we're currently in the position where a class property would appear
  isClassProperty() {
    return this.match((_types || _load_types()).types.colon) || super.isClassProperty();
  }

  isNonstaticConstructor(method) {
    return !this.match((_types || _load_types()).types.colon) && super.isNonstaticConstructor(method);
  }

  // parse type parameters for class methods
  parseClassMethod(classBody, method, isGenerator, isAsync, isConstructor) {
    if (method.variance) {
      this.unexpected(method.variance.start);
    }
    delete method.variance;
    if (this.isRelational("<")) {
      method.typeParameters = this.flowParseTypeParameterDeclaration();
    }

    super.parseClassMethod(classBody, method, isGenerator, isAsync, isConstructor);
  }

  // parse a the super class type parameters and implements
  parseClassSuper(node) {
    super.parseClassSuper(node);
    if (node.superClass && this.isRelational("<")) {
      node.superTypeParameters = this.flowParseTypeParameterInstantiation();
    }
    if (this.isContextual("implements")) {
      this.next();
      const implemented = node.implements = [];
      do {
        const node = this.startNode();
        node.id = this.parseIdentifier();
        if (this.isRelational("<")) {
          node.typeParameters = this.flowParseTypeParameterInstantiation();
        } else {
          node.typeParameters = null;
        }
        implemented.push(this.finishNode(node, "ClassImplements"));
      } while (this.eat((_types || _load_types()).types.comma));
    }
  }

  parsePropertyName(node) {
    const variance = this.flowParseVariance();
    const key = super.parsePropertyName(node);
    // $FlowIgnore ("variance" not defined on TsNamedTypeElementBase)
    node.variance = variance;
    return key;
  }

  // parse type parameters for object method shorthand
  parseObjPropValue(prop, startPos, startLoc, isGenerator, isAsync, isPattern, refShorthandDefaultPos) {
    if (prop.variance) {
      this.unexpected(prop.variance.start);
    }
    delete prop.variance;

    let typeParameters;

    // method shorthand
    if (this.isRelational("<")) {
      typeParameters = this.flowParseTypeParameterDeclaration();
      if (!this.match((_types || _load_types()).types.parenL)) this.unexpected();
    }

    super.parseObjPropValue(prop, startPos, startLoc, isGenerator, isAsync, isPattern, refShorthandDefaultPos);

    // add typeParameters if we found them
    if (typeParameters) {
      // $FlowFixMe (trying to set '.typeParameters' on an expression)
      (prop.value || prop).typeParameters = typeParameters;
    }
  }

  parseAssignableListItemTypes(param) {
    if (this.eat((_types || _load_types()).types.question)) {
      if (param.type !== "Identifier") {
        throw this.raise(param.start, "A binding pattern parameter cannot be optional in an implementation signature.");
      }

      param.optional = true;
    }
    if (this.match((_types || _load_types()).types.colon)) {
      param.typeAnnotation = this.flowParseTypeAnnotation();
    }
    this.finishNode(param, param.type);
    return param;
  }

  parseMaybeDefault(startPos, startLoc, left) {
    const node = super.parseMaybeDefault(startPos, startLoc, left);

    if (node.type === "AssignmentPattern" && node.typeAnnotation && node.right.start < node.typeAnnotation.start) {
      this.raise(node.typeAnnotation.start, "Type annotations must come before default assignments, e.g. instead of `age = 25: number` use `age: number = 25`");
    }

    return node;
  }

  // parse typeof and type imports
  parseImportSpecifiers(node) {
    node.importKind = "value";

    let kind = null;
    if (this.match((_types || _load_types()).types._typeof)) {
      kind = "typeof";
    } else if (this.isContextual("type")) {
      kind = "type";
    }
    if (kind) {
      const lh = this.lookahead();
      if (lh.type === (_types || _load_types()).types.name && lh.value !== "from" || lh.type === (_types || _load_types()).types.braceL || lh.type === (_types || _load_types()).types.star) {
        this.next();
        node.importKind = kind;
      }
    }

    super.parseImportSpecifiers(node);
  }

  // parse import-type/typeof shorthand
  parseImportSpecifier(node) {
    const specifier = this.startNode();
    const firstIdentLoc = this.state.start;
    const firstIdent = this.parseIdentifier(true);

    let specifierTypeKind = null;
    if (firstIdent.name === "type") {
      specifierTypeKind = "type";
    } else if (firstIdent.name === "typeof") {
      specifierTypeKind = "typeof";
    }

    let isBinding = false;
    if (this.isContextual("as")) {
      const as_ident = this.parseIdentifier(true);
      if (specifierTypeKind !== null && !this.match((_types || _load_types()).types.name) && !this.state.type.keyword) {
        // `import {type as ,` or `import {type as }`
        specifier.imported = as_ident;
        specifier.importKind = specifierTypeKind;
        specifier.local = as_ident.__clone();
      } else {
        // `import {type as foo`
        specifier.imported = firstIdent;
        specifier.importKind = null;
        specifier.local = this.parseIdentifier();
      }
    } else if (specifierTypeKind !== null && (this.match((_types || _load_types()).types.name) || this.state.type.keyword)) {
      // `import {type foo`
      specifier.imported = this.parseIdentifier(true);
      specifier.importKind = specifierTypeKind;
      if (this.eatContextual("as")) {
        specifier.local = this.parseIdentifier();
      } else {
        isBinding = true;
        specifier.local = specifier.imported.__clone();
      }
    } else {
      isBinding = true;
      specifier.imported = firstIdent;
      specifier.importKind = null;
      specifier.local = specifier.imported.__clone();
    }

    if ((node.importKind === "type" || node.importKind === "typeof") && (specifier.importKind === "type" || specifier.importKind === "typeof")) {
      this.raise(firstIdentLoc, "`The `type` and `typeof` keywords on named imports can only be used on regular `import` statements. It cannot be used with `import type` or `import typeof` statements`");
    }

    if (isBinding) this.checkReservedWord(specifier.local.name, specifier.start, true, true);

    this.checkLVal(specifier.local, true, undefined, "import specifier");
    node.specifiers.push(this.finishNode(specifier, "ImportSpecifier"));
  }

  // parse function type parameters - function foo<T>() {}
  parseFunctionParams(node) {
    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    }
    super.parseFunctionParams(node);
  }

  // parse flow type annotations on variable declarator heads - let foo: string = bar
  parseVarHead(decl) {
    super.parseVarHead(decl);
    if (this.match((_types || _load_types()).types.colon)) {
      decl.id.typeAnnotation = this.flowParseTypeAnnotation();
      this.finishNode(decl.id, decl.id.type);
    }
  }

  // parse the return type of an async arrow function - let foo = (async (): number => {});
  parseAsyncArrowFromCallExpression(node, call) {
    if (this.match((_types || _load_types()).types.colon)) {
      const oldNoAnonFunctionType = this.state.noAnonFunctionType;
      this.state.noAnonFunctionType = true;
      node.returnType = this.flowParseTypeAnnotation();
      this.state.noAnonFunctionType = oldNoAnonFunctionType;
    }

    return super.parseAsyncArrowFromCallExpression(node, call);
  }

  // todo description
  shouldParseAsyncArrow() {
    return this.match((_types || _load_types()).types.colon) || super.shouldParseAsyncArrow();
  }

  // We need to support type parameter declarations for arrow functions. This
  // is tricky. There are three situations we need to handle
  //
  // 1. This is either JSX or an arrow function. We'll try JSX first. If that
  //    fails, we'll try an arrow function. If that fails, we'll throw the JSX
  //    error.
  // 2. This is an arrow function. We'll parse the type parameter declaration,
  //    parse the rest, make sure the rest is an arrow function, and go from
  //    there
  // 3. This is neither. Just call the super method
  parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos) {
    let jsxError = null;
    if ((_types || _load_types()).types.jsxTagStart && this.match((_types || _load_types()).types.jsxTagStart)) {
      const state = this.state.clone();
      try {
        return super.parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos);
      } catch (err) {
        if (err instanceof SyntaxError) {
          this.state = state;

          // Remove `tc.j_expr` and `tc.j_oTag` from context added
          // by parsing `jsxTagStart` to stop the JSX plugin from
          // messing with the tokens
          this.state.context.length -= 2;

          jsxError = err;
        } else {
          // istanbul ignore next: no such error is expected
          throw err;
        }
      }
    }

    if (jsxError != null || this.isRelational("<")) {
      let arrowExpression;
      let typeParameters;
      try {
        typeParameters = this.flowParseTypeParameterDeclaration();

        arrowExpression = super.parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos);
        arrowExpression.typeParameters = typeParameters;
        this.resetStartLocationFromNode(arrowExpression, typeParameters);
      } catch (err) {
        throw jsxError || err;
      }

      if (arrowExpression.type === "ArrowFunctionExpression") {
        return arrowExpression;
      } else if (jsxError != null) {
        throw jsxError;
      } else {
        this.raise(typeParameters.start, "Expected an arrow function after this type parameter declaration");
      }
    }

    return super.parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos);
  }

  // handle return types for arrow functions
  parseArrow(node) {
    if (this.match((_types || _load_types()).types.colon)) {
      const state = this.state.clone();
      try {
        const oldNoAnonFunctionType = this.state.noAnonFunctionType;
        this.state.noAnonFunctionType = true;

        const typeNode = this.startNode();

        [
        // $FlowFixMe (destructuring not supported yet)
        typeNode.typeAnnotation,
        // $FlowFixMe (destructuring not supported yet)
        node.predicate] = this.flowParseTypeAndPredicateInitialiser();

        this.state.noAnonFunctionType = oldNoAnonFunctionType;

        if (this.canInsertSemicolon()) this.unexpected();
        if (!this.match((_types || _load_types()).types.arrow)) this.unexpected();

        // assign after it is clear it is an arrow
        node.returnType = typeNode.typeAnnotation ? this.finishNode(typeNode, "TypeAnnotation") : null;
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

  shouldParseArrow() {
    return this.match((_types || _load_types()).types.colon) || super.shouldParseArrow();
  }
};

module.exports = exports["default"];