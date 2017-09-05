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

(_types || _load_types()).types.jsxName = new (_types || _load_types()).TokenType("jsxName");
(_types || _load_types()).types.jsxText = new (_types || _load_types()).TokenType("jsxText", { beforeExpr: true });
(_types || _load_types()).types.jsxTagStart = new (_types || _load_types()).TokenType("jsxTagStart", { startsExpr: true });
(_types || _load_types()).types.jsxTagEnd = new (_types || _load_types()).TokenType("jsxTagEnd");
(_types || _load_types()).types.jsxTagStart.updateContext = function () {
    this.state.context.push((_context || _load_context()).types.j_expr); // treat as beginning of JSX expression
    this.state.context.push((_context || _load_context()).types.j_oTag); // start opening tag context
    this.state.exprAllowed = false;
};

(_types || _load_types()).types.jsxTagEnd.updateContext = function (prevType) {
    const out = this.state.context.pop();
    if (out === (_context || _load_context()).types.j_oTag && prevType === (_types || _load_types()).types.slash || out === (_context || _load_context()).types.j_cTag) {
        this.state.context.pop();
        this.state.exprAllowed = this.curContext() === (_context || _load_context()).types.j_expr;
    } else {
        this.state.exprAllowed = true;
    }
};

// Transforms JSX element name to string.

function getQualifiedJSXName(object) {
    if (object.type === "JSXIdentifier") {
        return object.name;
    }

    if (object.type === "JSXNamespacedName") {
        return object.namespace.name + ":" + object.name.name;
    }

    if (object.type === "JSXMemberExpression") {
        return getQualifiedJSXName(object.object) + "." + getQualifiedJSXName(object.property);
    }

    // istanbul ignore next
    throw new Error("Node had unexpected type: " + object.type);
}

exports.default = superClass => class extends superClass {
    // Reads inline JSX contents token.

    jsxReadToken() {
        let out = "";
        let chunkStart = this.state.pos;
        for (;;) {
            if (this.state.pos >= this.input.length) {
                this.raise(this.state.start, "Unterminated JSX contents");
            }

            const ch = this.input.charCodeAt(this.state.pos);

            switch (ch) {
                case 38:
                    // "&"
                    out += this.input.slice(chunkStart, this.state.pos);
                    out += this.jsxReadEntity();
                    chunkStart = this.state.pos;
                    break;

                case 60: // "<"
                case 123:
                    // "{"
                    if (ch === 60 || !specTags.includes(this.__cur_tag)) {
                        if (this.state.pos === this.state.start) {
                            if (ch === 60 && this.state.exprAllowed) {
                                ++this.state.pos;
                                return this.finishToken((_types || _load_types()).types.jsxTagStart);
                            }
                            return this.getTokenFromCode(ch);
                        }
                        out += this.input.slice(chunkStart, this.state.pos);
                        return this.finishToken((_types || _load_types()).types.jsxText, out);
                    }

                default:
                    if ((0, (_whitespace || _load_whitespace()).isNewLine)(ch)) {
                        out += this.input.slice(chunkStart, this.state.pos);
                        out += this.jsxReadNewLine(true);
                        chunkStart = this.state.pos;
                    } else {
                        ++this.state.pos;
                    }
            }
        }
    }

    jsxReadNewLine(normalizeCRLF) {
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

    jsxReadString(quote) {
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
                out += this.jsxReadEntity();
                chunkStart = this.state.pos;
            } else if ((0, (_whitespace || _load_whitespace()).isNewLine)(ch)) {
                out += this.input.slice(chunkStart, this.state.pos);
                out += this.jsxReadNewLine(false);
                chunkStart = this.state.pos;
            } else {
                ++this.state.pos;
            }
        }
        out += this.input.slice(chunkStart, this.state.pos++);
        return this.finishToken((_types || _load_types()).types.string, out);
    }

    jsxReadEntity() {
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

    // Read a JSX identifier (valid tag or attribute name).
    //
    // Optimized version since JSX identifiers can"t contain
    // escape characters and so can be read as single slice.
    // Also assumes that first character was already checked
    // by isIdentifierStart in readToken.

    jsxReadWord() {
        let ch;
        const start = this.state.pos;
        do {
            ch = this.input.charCodeAt(++this.state.pos);
        } while ((0, (_identifier || _load_identifier()).isIdentifierChar)(ch) || ch === 45); // "-"
        return this.finishToken((_types || _load_types()).types.jsxName, this.input.slice(start, this.state.pos));
    }

    // Parse next token as JSX identifier

    jsxParseIdentifier() {
        const node = this.startNode();
        if (this.match((_types || _load_types()).types.jsxName)) {
            node.name = this.state.value;
        } else if (this.state.type.keyword) {
            node.name = this.state.type.keyword;
        } else {
            this.unexpected();
        }
        this.next();
        return this.finishNode(node, "JSXIdentifier");
    }

    // Parse namespaced identifier.

    jsxParseNamespacedName() {
        const startPos = this.state.start;
        const startLoc = this.state.startLoc;
        const name = this.jsxParseIdentifier();
        if (!this.eat((_types || _load_types()).types.colon)) return name;

        const node = this.startNodeAt(startPos, startLoc);
        node.namespace = name;
        node.name = this.jsxParseIdentifier();
        return this.finishNode(node, "JSXNamespacedName");
    }

    // Parses element name in any form - namespaced, member
    // or single identifier.

    jsxParseElementName() {
        const startPos = this.state.start;
        const startLoc = this.state.startLoc;
        let node = this.jsxParseNamespacedName();
        while (this.eat((_types || _load_types()).types.dot)) {
            const newNode = this.startNodeAt(startPos, startLoc);
            newNode.object = node;
            newNode.property = this.jsxParseIdentifier();
            node = this.finishNode(newNode, "JSXMemberExpression");
        }
        return node;
    }

    // Parses any type of JSX attribute value.

    jsxParseAttributeValue() {
        let node;
        switch (this.state.type) {
            case (_types || _load_types()).types.braceL:
                node = this.jsxParseExpressionContainer();
                if (node.expression.type === "JSXEmptyExpression") {
                    throw this.raise(node.start, "JSX attributes must only be assigned a non-empty expression");
                } else {
                    return node;
                }

            case (_types || _load_types()).types.jsxTagStart:
            case (_types || _load_types()).types.string:
                return this.parseExprAtom();

            default:
                throw this.raise(this.state.start, "JSX value should be either an expression or a quoted JSX text");
        }
    }

    // JSXEmptyExpression is unique type since it doesn't actually parse anything,
    // and so it should start at the end of last read token (left brace) and finish
    // at the beginning of the next one (right brace).

    jsxParseEmptyExpression() {
        const node = this.startNodeAt(this.state.lastTokEnd, this.state.lastTokEndLoc);
        return this.finishNodeAt(node, "JSXEmptyExpression", this.state.start, this.state.startLoc);
    }

    // Parse JSX spread child

    jsxParseSpreadChild() {
        const node = this.startNode();
        this.expect((_types || _load_types()).types.braceL);
        this.expect((_types || _load_types()).types.ellipsis);
        node.expression = this.parseExpression();
        this.expect((_types || _load_types()).types.braceR);

        return this.finishNode(node, "JSXSpreadChild");
    }

    // Parses JSX expression enclosed into curly brackets.

    jsxParseExpressionContainer() {
        const node = this.startNode();
        this.next();
        if (this.match((_types || _load_types()).types.braceR)) {
            node.expression = this.jsxParseEmptyExpression();
        } else {
            node.expression = this.parseExpression();
        }
        this.expect((_types || _load_types()).types.braceR);
        return this.finishNode(node, "JSXExpressionContainer");
    }

    // Parses following JSX attribute name-value pair.

    jsxParseAttribute() {
        const node = this.startNode();
        if (this.eat((_types || _load_types()).types.braceL)) {
            this.expect((_types || _load_types()).types.ellipsis);
            node.argument = this.parseMaybeAssign();
            this.expect((_types || _load_types()).types.braceR);
            return this.finishNode(node, "JSXSpreadAttribute");
        }
        node.name = this.jsxParseNamespacedName();
        node.value = this.eat((_types || _load_types()).types.eq) ? this.jsxParseAttributeValue() : null;
        return this.finishNode(node, "JSXAttribute");
    }

    // Parses JSX opening tag starting after "<".

    jsxParseOpeningElementAt(startPos, startLoc) {
        const node = this.startNodeAt(startPos, startLoc);
        node.attributes = [];
        node.name = this.jsxParseElementName();
        while (!this.match((_types || _load_types()).types.slash) && !this.match((_types || _load_types()).types.jsxTagEnd)) {
            node.attributes.push(this.jsxParseAttribute());
        }
        node.selfClosing = this.eat((_types || _load_types()).types.slash);
        this.expect((_types || _load_types()).types.jsxTagEnd);
        return this.finishNode(node, "JSXOpeningElement");
    }

    // Parses JSX closing tag starting after "</".

    jsxParseClosingElementAt(startPos, startLoc) {
        const node = this.startNodeAt(startPos, startLoc);
        node.name = this.jsxParseElementName();
        this.expect((_types || _load_types()).types.jsxTagEnd);
        return this.finishNode(node, "JSXClosingElement");
    }

    // Parses entire JSX element, including it"s opening tag
    // (starting after "<"), attributes, contents and closing tag.

    jsxParseElementAt(startPos, startLoc) {
        const node = this.startNodeAt(startPos, startLoc);
        const children = [];
        const openingElement = this.jsxParseOpeningElementAt(startPos, startLoc);
        let closingElement = null;

        const openingElementTagName = openingElement.name.name;

        if (!openingElement.selfClosing) {
            contents: for (;;) {
                switch (this.state.type) {
                    case (_types || _load_types()).types.jsxTagStart:
                        startPos = this.state.start;
                        startLoc = this.state.startLoc;
                        this.next();
                        if (this.eat((_types || _load_types()).types.slash)) {
                            closingElement = this.jsxParseClosingElementAt(startPos, startLoc);
                            break contents;
                        }
                        children.push(this.jsxParseElementAt(startPos, startLoc));
                        break;

                    case (_types || _load_types()).types.jsxText:
                        children.push(this.parseExprAtom());
                        break;

                    case (_types || _load_types()).types.braceL:
                        if (this.lookahead().type === (_types || _load_types()).types.ellipsis) {
                            children.push(this.jsxParseSpreadChild());
                        } else {
                            children.push(specTags.includes(openingElementTagName) ? this.parseExprAtom() : this.jsxParseExpressionContainer());
                        }

                        break;

                    // istanbul ignore next - should never happen
                    default:
                        throw this.unexpected();
                }
            }

            if (
            // $FlowIgnore
            getQualifiedJSXName(closingElement.name) !== getQualifiedJSXName(openingElement.name)) {
                this.raise(
                // $FlowIgnore
                closingElement.start, "Expected corresponding JSX closing tag for <" + getQualifiedJSXName(openingElement.name) + ">");
            }
        }

        node.openingElement = openingElement;
        node.closingElement = closingElement;
        node.children = children;
        if (this.match((_types || _load_types()).types.relational) && this.state.value === "<") {
            this.raise(this.state.start, "Adjacent JSX elements must be wrapped in an enclosing tag");
        }
        return this.finishNode(node, "JSXElement");
    }

    // Parses entire JSX element from current position.

    jsxParseElement() {
        const startPos = this.state.start;
        const startLoc = this.state.startLoc;
        this.next();
        return this.jsxParseElementAt(startPos, startLoc);
    }

    // ==================================
    // Overrides
    // ==================================

    parseExprAtom(refShortHandDefaultPos) {
        if (this.match((_types || _load_types()).types.jsxText)) {
            return this.parseLiteral(this.state.value, "JSXText");
        } else if (this.match((_types || _load_types()).types.jsxTagStart)) {
            return this.jsxParseElement();
        } else {
            return super.parseExprAtom(refShortHandDefaultPos);
        }
    }

    readToken(code) {
        if (this.state.inPropertyName) return super.readToken(code);

        const context = this.curContext();

        if (context === (_context || _load_context()).types.j_expr) {
            return this.jsxReadToken();
        }

        if (context === (_context || _load_context()).types.j_oTag || context === (_context || _load_context()).types.j_cTag) {
            if ((0, (_identifier || _load_identifier()).isIdentifierStart)(code)) {
                return this.jsxReadWord();
            }

            if (code === 62) {
                if (this.state.value) {
                    this.__cur_tag = this.state.value;
                }

                ++this.state.pos;
                return this.finishToken((_types || _load_types()).types.jsxTagEnd);
            }

            if ((code === 34 || code === 39) && context === (_context || _load_context()).types.j_oTag) {
                return this.jsxReadString(code);
            }
        }

        if (code === 60 && this.state.exprAllowed) {
            ++this.state.pos;
            return this.finishToken((_types || _load_types()).types.jsxTagStart);
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
        } else if (this.match((_types || _load_types()).types.slash) && prevType === (_types || _load_types()).types.jsxTagStart) {
            this.state.context.length -= 2; // do not consider JSX expr -> JSX open tag -> ... anymore
            this.state.context.push((_context || _load_context()).types.j_cTag); // reconsider as closing tag context
            this.state.exprAllowed = false;
        } else {
            return super.updateContext(prevType);
        }
    }
};

module.exports = exports["default"];