"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _fromCodePoint;

function _load_fromCodePoint() {
    return _fromCodePoint = _interopRequireDefault(require("babel-runtime/core-js/string/from-code-point"));
}

var _xhtml;

function _load_xhtml() {
    return _xhtml = _interopRequireDefault(require("../xhtml"));
}

var _types;

function _load_types() {
    return _types = require("../../tokenizer/types");
}

var _context;

function _load_context() {
    return _context = require("../../tokenizer/context");
}

var _types2;

function _load_types2() {
    return _types2 = _interopRequireWildcard(require("../../types"));
}

var _identifier;

function _load_identifier() {
    return _identifier = require("../../util/identifier");
}

var _whitespace;

function _load_whitespace() {
    return _whitespace = require("../../util/whitespace");
}

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const HEX_NUMBER = /^[da-fA-F]+$/;
const DECIMAL_NUMBER = /^d+$/;

const specTags = ['style', 'script'];

(_context || _load_context()).types.j_oTag = new (_context || _load_context()).TokContext("<tag", false);
(_context || _load_context()).types.j_cTag = new (_context || _load_context()).TokContext("</tag", false);
(_context || _load_context()).types.j_expr = new (_context || _load_context()).TokContext("<tag>...</tag>", true, true);

(_types || _load_types()).types.lesxName = new (_types || _load_types()).TokenType("lesxName");
(_types || _load_types()).types.lesxText = new (_types || _load_types()).TokenType("lesxText", { beforeExpr: true });
(_types || _load_types()).types.lesxTagStart = new (_types || _load_types()).TokenType("lesxTagStart", { startsExpr: true });
(_types || _load_types()).types.lesxTagEnd = new (_types || _load_types()).TokenType("lesxTagEnd");
(_types || _load_types()).types.lesxTagStart.updateContext = function () {
    this.state.context.push((_context || _load_context()).types.j_expr); // treat as beginning of Lesx expression
    this.state.context.push((_context || _load_context()).types.j_oTag); // start opening tag context
    this.state.exprAllowed = false;
};

(_types || _load_types()).types.lesxTagEnd.updateContext = function (prevType) {
    const out = this.state.context.pop();
    if (out === (_context || _load_context()).types.j_oTag && prevType === (_types || _load_types()).types.slash || out === (_context || _load_context()).types.j_cTag) {
        this.state.context.pop();
        this.state.exprAllowed = this.curContext() === (_context || _load_context()).types.j_expr;
    } else {
        this.state.exprAllowed = true;
    }
};

// Transforms Lesx element name to string.

function getQualifiedLesxName(object) {
    if (object.type === "LesxIdentifier") {
        return object.name;
    }

    if (object.type === "LesxNamespacedName") {
        return object.namespace.name + ":" + object.name.name;
    }

    if (object.type === "LesxMemberExpression") {
        return getQualifiedLesxName(object.object) + "." + getQualifiedLesxName(object.property);
    }

    // istanbul ignore next
    throw new Error("Node had unexpected type: " + object.type);
}

exports.default = superClass => class extends superClass {
    // Reads inline Lesx contents token.

    lesxReadToken() {
        let out = "";
        let chunkStart = this.state.pos;
        for (;;) {
            if (this.state.pos >= this.input.length) {
                this.raise(this.state.start, "Unterminated Lesx contents");
            }

            const ch = this.input.charCodeAt(this.state.pos);

            switch (ch) {
                case 38:
                    // "&"
                    out += this.input.slice(chunkStart, this.state.pos);
                    out += this.lesxReadEntity();
                    chunkStart = this.state.pos;
                    break;

                case 60: // "<"
                case 123:
                    // "{"
                    if (ch === 60 || !specTags.includes(this.__cur_tag)) {
                        if (this.state.pos === this.state.start) {
                            if (ch === 60 && this.state.exprAllowed) {
                                ++this.state.pos;
                                return this.finishToken((_types || _load_types()).types.lesxTagStart);
                            }
                            return this.getTokenFromCode(ch);
                        }
                        out += this.input.slice(chunkStart, this.state.pos);
                        return this.finishToken((_types || _load_types()).types.lesxText, out);
                    }

                default:
                    if ((0, (_whitespace || _load_whitespace()).isNewLine)(ch)) {
                        out += this.input.slice(chunkStart, this.state.pos);
                        out += this.lesxReadNewLine(true);
                        chunkStart = this.state.pos;
                    } else {
                        ++this.state.pos;
                    }
            }
        }
    }

    lesxReadNewLine(normalizeCRLF) {
        const ch = this.input.charCodeAt(this.state.pos);
        let out;
        ++this.state.pos;
        if (ch === 13 && this.input.charCodeAt(this.state.pos) === 10) {
            ++this.state.pos;
            out = normalizeCRLF ? "\n" : "\r\n";
        } else {
            out = String.fromCharCode(ch);
        }
        ++this.state.curLine;
        this.state.lineStart = this.state.pos;

        return out;
    }

    lesxReadString(quote) {
        let out = "";
        let chunkStart = ++this.state.pos;
        for (;;) {
            if (this.state.pos >= this.input.length) {
                this.raise(this.state.start, "Unterminated string constant");
            }

            const ch = this.input.charCodeAt(this.state.pos);
            if (ch === quote) break;
            if (ch === 38) {
                // "&"
                out += this.input.slice(chunkStart, this.state.pos);
                out += this.lesxReadEntity();
                chunkStart = this.state.pos;
            } else if ((0, (_whitespace || _load_whitespace()).isNewLine)(ch)) {
                out += this.input.slice(chunkStart, this.state.pos);
                out += this.lesxReadNewLine(false);
                chunkStart = this.state.pos;
            } else {
                ++this.state.pos;
            }
        }
        out += this.input.slice(chunkStart, this.state.pos++);
        return this.finishToken((_types || _load_types()).types.string, out);
    }

    lesxReadEntity() {
        let str = "";
        let count = 0;
        let entity;
        let ch = this.input[this.state.pos];

        const startPos = ++this.state.pos;
        while (this.state.pos < this.input.length && count++ < 10) {
            ch = this.input[this.state.pos++];
            if (ch === ";") {
                if (str[0] === "#") {
                    if (str[1] === "x") {
                        str = str.substr(2);
                        if (HEX_NUMBER.test(str)) entity = (0, (_fromCodePoint || _load_fromCodePoint()).default)(parseInt(str, 16));
                    } else {
                        str = str.substr(1);
                        if (DECIMAL_NUMBER.test(str)) entity = (0, (_fromCodePoint || _load_fromCodePoint()).default)(parseInt(str, 10));
                    }
                } else {
                    entity = (_xhtml || _load_xhtml()).default[str];
                }
                break;
            }
            str += ch;
        }
        if (!entity) {
            this.state.pos = startPos;
            return "&";
        }
        return entity;
    }

    // Read a Lesx identifier (valid tag or attribute name).
    //
    // Optimized version since Lesx identifiers can"t contain
    // escape characters and so can be read as single slice.
    // Also assumes that first character was already checked
    // by isIdentifierStart in readToken.

    lesxReadWord() {
        let ch;
        const start = this.state.pos;
        do {
            ch = this.input.charCodeAt(++this.state.pos);
        } while ((0, (_identifier || _load_identifier()).isIdentifierChar)(ch) || ch === 45); // "-"
        return this.finishToken((_types || _load_types()).types.lesxName, this.input.slice(start, this.state.pos));
    }

    // Parse next token as Lesx identifier

    lesxParseIdentifier() {
        const node = this.startNode();
        if (this.match((_types || _load_types()).types.lesxName)) {
            node.name = this.state.value;
        } else if (this.state.type.keyword) {
            node.name = this.state.type.keyword;
        } else {
            this.unexpected();
        }
        this.next();
        return this.finishNode(node, "LesxIdentifier");
    }

    // Parse namespaced identifier.

    lesxParseNamespacedName() {
        const startPos = this.state.start;
        const startLoc = this.state.startLoc;
        const name = this.lesxParseIdentifier();
        if (!this.eat((_types || _load_types()).types.colon)) return name;

        const node = this.startNodeAt(startPos, startLoc);
        node.namespace = name;
        node.name = this.lesxParseIdentifier();
        return this.finishNode(node, "LesxNamespacedName");
    }

    // Parses element name in any form - namespaced, member
    // or single identifier.

    lesxParseElementName() {
        const startPos = this.state.start;
        const startLoc = this.state.startLoc;
        let node = this.lesxParseNamespacedName();
        while (this.eat((_types || _load_types()).types.dot)) {
            const newNode = this.startNodeAt(startPos, startLoc);
            newNode.object = node;
            newNode.property = this.lesxParseIdentifier();
            node = this.finishNode(newNode, "LesxMemberExpression");
        }
        return node;
    }

    // Parses any type of Lesx attribute value.

    lesxParseAttributeValue() {
        let node;
        switch (this.state.type) {
            case (_types || _load_types()).types.braceL:
                node = this.lesxParseExpressionContainer();
                if (node.expression.type === "LesxEmptyExpression") {
                    throw this.raise(node.start, "Lesx attributes must only be assigned a non-empty expression");
                } else {
                    return node;
                }

            case (_types || _load_types()).types.lesxTagStart:
            case (_types || _load_types()).types.string:
                return this.parseExprAtom();

            default:
                throw this.raise(this.state.start, "Lesx value should be either an expression or a quoted Lesx text");
        }
    }

    // LesxEmptyExpression is unique type since it doesn't actually parse anything,
    // and so it should start at the end of last read token (left brace) and finish
    // at the beginning of the next one (right brace).

    lesxParseEmptyExpression() {
        const node = this.startNodeAt(this.state.lastTokEnd, this.state.lastTokEndLoc);
        return this.finishNodeAt(node, "LesxEmptyExpression", this.state.start, this.state.startLoc);
    }

    // Parse Lesx spread child

    lesxParseSpreadChild() {
        const node = this.startNode();
        this.expect((_types || _load_types()).types.braceL);
        this.expect((_types || _load_types()).types.ellipsis);
        node.expression = this.parseExpression();
        this.expect((_types || _load_types()).types.braceR);

        return this.finishNode(node, "LesxSpreadChild");
    }

    // Parses Lesx expression enclosed into curly brackets.

    lesxParseExpressionContainer() {
        const node = this.startNode();
        this.next();
        if (this.match((_types || _load_types()).types.braceR)) {
            node.expression = this.lesxParseEmptyExpression();
        } else {
            node.expression = this.parseExpression();
        }
        this.expect((_types || _load_types()).types.braceR);
        return this.finishNode(node, "LesxExpressionContainer");
    }

    // Parses following Lesx attribute name-value pair.

    lesxParseAttribute() {
        const node = this.startNode();
        if (this.eat((_types || _load_types()).types.braceL)) {
            this.expect((_types || _load_types()).types.ellipsis);
            node.argument = this.parseMaybeAssign();
            this.expect((_types || _load_types()).types.braceR);
            return this.finishNode(node, "LesxSpreadAttribute");
        }
        node.name = this.lesxParseNamespacedName();
        node.value = this.eat((_types || _load_types()).types.eq) ? this.lesxParseAttributeValue() : null;
        return this.finishNode(node, "LesxAttribute");
    }

    // Parses Lesx opening tag starting after "<".

    lesxParseOpeningElementAt(startPos, startLoc) {
        const node = this.startNodeAt(startPos, startLoc);
        node.attributes = [];
        node.name = this.lesxParseElementName();
        while (!this.match((_types || _load_types()).types.slash) && !this.match((_types || _load_types()).types.lesxTagEnd)) {
            node.attributes.push(this.lesxParseAttribute());
        }
        node.selfClosing = this.eat((_types || _load_types()).types.slash);
        this.expect((_types || _load_types()).types.lesxTagEnd);
        return this.finishNode(node, "LesxOpeningElement");
    }

    // Parses Lesx closing tag starting after "</".

    lesxParseClosingElementAt(startPos, startLoc) {
        const node = this.startNodeAt(startPos, startLoc);
        node.name = this.lesxParseElementName();
        this.expect((_types || _load_types()).types.lesxTagEnd);
        return this.finishNode(node, "LesxClosingElement");
    }

    // Parses entire Lesx element, including it"s opening tag
    // (starting after "<"), attributes, contents and closing tag.

    lesxParseElementAt(startPos, startLoc) {
        const node = this.startNodeAt(startPos, startLoc);
        const children = [];
        const openingElement = this.lesxParseOpeningElementAt(startPos, startLoc);
        let closingElement = null;

        const openingElementTagName = openingElement.name.name;

        if (!openingElement.selfClosing) {
            contents: for (;;) {
                switch (this.state.type) {
                    case (_types || _load_types()).types.lesxTagStart:
                        startPos = this.state.start;
                        startLoc = this.state.startLoc;
                        this.next();
                        if (this.eat((_types || _load_types()).types.slash)) {
                            closingElement = this.lesxParseClosingElementAt(startPos, startLoc);
                            break contents;
                        }
                        children.push(this.lesxParseElementAt(startPos, startLoc));
                        break;

                    case (_types || _load_types()).types.lesxText:
                        children.push(this.parseExprAtom());
                        break;

                    case (_types || _load_types()).types.braceL:
                        if (this.lookahead().type === (_types || _load_types()).types.ellipsis) {
                            children.push(this.lesxParseSpreadChild());
                        } else {
                            children.push(specTags.includes(openingElementTagName) ? this.parseExprAtom() : this.lesxParseExpressionContainer());
                        }

                        break;

                    // istanbul ignore next - should never happen
                    default:
                        throw this.unexpected();
                }
            }

            if (
            // $FlowIgnore
            getQualifiedLesxName(closingElement.name) !== getQualifiedLesxName(openingElement.name)) {
                this.raise(
                // $FlowIgnore
                closingElement.start, "Expected corresponding Lesx closing tag for <" + getQualifiedLesxName(openingElement.name) + ">");
            }
        }

        node.openingElement = openingElement;
        node.closingElement = closingElement;
        node.children = children;
        if (this.match((_types || _load_types()).types.relational) && this.state.value === "<") {
            this.raise(this.state.start, "Adjacent Lesx elements must be wrapped in an enclosing tag");
        }
        return this.finishNode(node, "LesxElement");
    }

    // Parses entire Lesx element from current position.

    lesxParseElement() {
        const startPos = this.state.start;
        const startLoc = this.state.startLoc;
        this.next();
        return this.lesxParseElementAt(startPos, startLoc);
    }

    // ==================================
    // Overrides
    // ==================================

    parseExprAtom(refShortHandDefaultPos) {
        if (this.match((_types || _load_types()).types.lesxText)) {
            return this.parseLiteral(this.state.value, "LesxText");
        } else if (this.match((_types || _load_types()).types.lesxTagStart)) {
            return this.lesxParseElement();
        } else {
            return super.parseExprAtom(refShortHandDefaultPos);
        }
    }

    readToken(code) {
        if (this.state.inPropertyName) return super.readToken(code);

        const context = this.curContext();

        if (context === (_context || _load_context()).types.j_expr) {
            return this.lesxReadToken();
        }

        if (context === (_context || _load_context()).types.j_oTag || context === (_context || _load_context()).types.j_cTag) {
            if ((0, (_identifier || _load_identifier()).isIdentifierStart)(code)) {
                return this.lesxReadWord();
            }

            if (code === 62) {
                if (this.state.value) {
                    this.__cur_tag = this.state.value;
                }

                ++this.state.pos;
                return this.finishToken((_types || _load_types()).types.lesxTagEnd);
            }

            if ((code === 34 || code === 39) && context === (_context || _load_context()).types.j_oTag) {
                return this.lesxReadString(code);
            }
        }

        if (code === 60 && this.state.exprAllowed) {
            ++this.state.pos;
            return this.finishToken((_types || _load_types()).types.lesxTagStart);
        }

        return super.readToken(code);
    }

    updateContext(prevType) {
        if (this.match((_types || _load_types()).types.braceL)) {
            const curContext = this.curContext();
            if (curContext === (_context || _load_context()).types.j_oTag) {
                this.state.context.push((_context || _load_context()).types.braceExpression);
            } else if (curContext === (_context || _load_context()).types.j_expr) {
                this.state.context.push((_context || _load_context()).types.templateQuasi);
            } else {
                super.updateContext(prevType);
            }
            this.state.exprAllowed = true;
        } else if (this.match((_types || _load_types()).types.slash) && prevType === (_types || _load_types()).types.lesxTagStart) {
            this.state.context.length -= 2; // do not consider Lesx expr -> Lesx open tag -> ... anymore
            this.state.context.push((_context || _load_context()).types.j_cTag); // reconsider as closing tag context
            this.state.exprAllowed = false;
        } else {
            return super.updateContext(prevType);
        }
    }
};

module.exports = exports["default"];