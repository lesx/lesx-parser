// @flow

import XHTMLEntities from "../xhtml";
import type Parser from "../../parser";
import { TokenType, types as tt } from "../../tokenizer/types";
import { TokContext, types as tc } from "../../tokenizer/context";
import * as N from "../../types";
import { isIdentifierChar, isIdentifierStart } from "../../util/identifier";
import type { Pos, Position } from "../../util/location";
import { isNewLine } from "../../util/whitespace";

const HEX_NUMBER = /^[da-fA-F]+$/;
const DECIMAL_NUMBER = /^d+$/;

const specTags = ['style', 'script'];

tc.j_oTag = new TokContext("<tag", false);
tc.j_cTag = new TokContext("</tag", false);
tc.j_expr = new TokContext("<tag>...</tag>", true, true);

tt.lesxName = new TokenType("lesxName");
tt.lesxText = new TokenType("lesxText", { beforeExpr: true });
tt.lesxTagStart = new TokenType("lesxTagStart", { startsExpr: true });
tt.lesxTagEnd = new TokenType("lesxTagEnd");
tt.lesxTagStart.updateContext = function() {
    this.state.context.push(tc.j_expr); // treat as beginning of Lesx expression
    this.state.context.push(tc.j_oTag); // start opening tag context
    this.state.exprAllowed = false;
};

tt.lesxTagEnd.updateContext = function(prevType) {
    const out = this.state.context.pop();
    if ((out === tc.j_oTag && prevType === tt.slash) || out === tc.j_cTag) {
        this.state.context.pop();
        this.state.exprAllowed = this.curContext() === tc.j_expr;
    } else {
        this.state.exprAllowed = true;
    }
};

// Transforms Lesx element name to string.

function getQualifiedLesxName(
    object: N.LesxIdentifier | N.LesxNamespacedName | N.LesxMemberExpression,
): string {
    if (object.type === "LesxIdentifier") {
        return object.name;
    }

    if (object.type === "LesxNamespacedName") {
        return object.namespace.name + ":" + object.name.name;
    }

    if (object.type === "LesxMemberExpression") {
        return (
            getQualifiedLesxName(object.object) +
            "." +
            getQualifiedLesxName(object.property)
        );
    }

    // istanbul ignore next
    throw new Error("Node had unexpected type: " + object.type);
}

export default (superClass: Class < Parser > ): Class < Parser > =>
    class extends superClass {
        // Reads inline Lesx contents token.

        lesxReadToken(): void {
            let out = "";
            let chunkStart = this.state.pos;
            for (;;) {
                if (this.state.pos >= this.input.length) {
                    this.raise(this.state.start, "Unterminated Lesx contents");
                }

                const ch = this.input.charCodeAt(this.state.pos);

                switch (ch) {
                    case 38: // "&"
                        out += this.input.slice(chunkStart, this.state.pos);
                        out += this.lesxReadEntity();
                        chunkStart = this.state.pos;
                        break;

                    case 60: // "<"
                    case 123: // "{"
                        if(ch === 60 || !specTags.includes(this.__cur_tag)) {
                            if (this.state.pos === this.state.start) {
                                if (ch === 60 && this.state.exprAllowed) {
                                    ++this.state.pos;
                                    return this.finishToken(tt.lesxTagStart);
                                }
                                return this.getTokenFromCode(ch);
                            }
                            out += this.input.slice(chunkStart, this.state.pos);
                            return this.finishToken(tt.lesxText, out);
                        }


                    default:
                        if (isNewLine(ch)) {
                            out += this.input.slice(chunkStart, this.state.pos);
                            out += this.lesxReadNewLine(true);
                            chunkStart = this.state.pos;
                        } else {
                            ++this.state.pos;
                        }
                }
            }
        }

        lesxReadNewLine(normalizeCRLF: boolean): string {
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

        lesxReadString(quote: number): void {
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
                } else if (isNewLine(ch)) {
                    out += this.input.slice(chunkStart, this.state.pos);
                    out += this.lesxReadNewLine(false);
                    chunkStart = this.state.pos;
                } else {
                    ++this.state.pos;
                }
            }
            out += this.input.slice(chunkStart, this.state.pos++);
            return this.finishToken(tt.string, out);
        }

        lesxReadEntity(): string {
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
                            if (HEX_NUMBER.test(str))
                                entity = String.fromCodePoint(parseInt(str, 16));
                        } else {
                            str = str.substr(1);
                            if (DECIMAL_NUMBER.test(str))
                                entity = String.fromCodePoint(parseInt(str, 10));
                        }
                    } else {
                        entity = XHTMLEntities[str];
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

        lesxReadWord(): void {
            let ch;
            const start = this.state.pos;
            do {
                ch = this.input.charCodeAt(++this.state.pos);
            } while (isIdentifierChar(ch) || ch === 45); // "-"
            return this.finishToken(
                tt.lesxName,
                this.input.slice(start, this.state.pos),
            );
        }

        // Parse next token as Lesx identifier

        lesxParseIdentifier(): N.LesxIdentifier {
            const node = this.startNode();
            if (this.match(tt.lesxName)) {
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

        lesxParseNamespacedName(): N.LesxNamespacedName {
            const startPos = this.state.start;
            const startLoc = this.state.startLoc;
            const name = this.lesxParseIdentifier();
            if (!this.eat(tt.colon)) return name;

            const node = this.startNodeAt(startPos, startLoc);
            node.namespace = name;
            node.name = this.lesxParseIdentifier();
            return this.finishNode(node, "LesxNamespacedName");
        }

        // Parses element name in any form - namespaced, member
        // or single identifier.

        lesxParseElementName(): N.LesxNamespacedName | N.LesxMemberExpression {
            const startPos = this.state.start;
            const startLoc = this.state.startLoc;
            let node = this.lesxParseNamespacedName();
            while (this.eat(tt.dot)) {
                const newNode = this.startNodeAt(startPos, startLoc);
                newNode.object = node;
                newNode.property = this.lesxParseIdentifier();
                node = this.finishNode(newNode, "LesxMemberExpression");
            }
            return node;
        }

        // Parses any type of Lesx attribute value.

        lesxParseAttributeValue(): N.Expression {
            let node;
            switch (this.state.type) {
                case tt.braceL:
                    node = this.lesxParseExpressionContainer();
                    if (node.expression.type === "LesxEmptyExpression") {
                        throw this.raise(
                            node.start,
                            "Lesx attributes must only be assigned a non-empty expression",
                        );
                    } else {
                        return node;
                    }

                case tt.lesxTagStart:
                case tt.string:
                    return this.parseExprAtom();

                default:
                    throw this.raise(
                        this.state.start,
                        "Lesx value should be either an expression or a quoted Lesx text",
                    );
            }
        }

        // LesxEmptyExpression is unique type since it doesn't actually parse anything,
        // and so it should start at the end of last read token (left brace) and finish
        // at the beginning of the next one (right brace).

        lesxParseEmptyExpression(): N.LesxEmptyExpression {
            const node = this.startNodeAt(
                this.state.lastTokEnd,
                this.state.lastTokEndLoc,
            );
            return this.finishNodeAt(
                node,
                "LesxEmptyExpression",
                this.state.start,
                this.state.startLoc,
            );
        }

        // Parse Lesx spread child

        lesxParseSpreadChild(): N.LesxSpreadChild {
            const node = this.startNode();
            this.expect(tt.braceL);
            this.expect(tt.ellipsis);
            node.expression = this.parseExpression();
            this.expect(tt.braceR);

            return this.finishNode(node, "LesxSpreadChild");
        }

        // Parses Lesx expression enclosed into curly brackets.

        lesxParseExpressionContainer(): N.LesxExpressionContainer {
            const node = this.startNode();
            this.next();
            if (this.match(tt.braceR)) {
                node.expression = this.lesxParseEmptyExpression();
            } else {
                node.expression = this.parseExpression();
            }
            this.expect(tt.braceR);
            return this.finishNode(node, "LesxExpressionContainer");
        }

        // Parses following Lesx attribute name-value pair.

        lesxParseAttribute(): N.LesxAttribute {
            const node = this.startNode();
            if (this.eat(tt.braceL)) {
                this.expect(tt.ellipsis);
                node.argument = this.parseMaybeAssign();
                this.expect(tt.braceR);
                return this.finishNode(node, "LesxSpreadAttribute");
            }
            node.name = this.lesxParseNamespacedName();
            node.value = this.eat(tt.eq) ? this.lesxParseAttributeValue() : null;
            return this.finishNode(node, "LesxAttribute");
        }

        // Parses Lesx opening tag starting after "<".

        lesxParseOpeningElementAt(
            startPos: number,
            startLoc: Position,
        ): N.LesxOpeningElement {
            const node = this.startNodeAt(startPos, startLoc);
            node.attributes = [];
            node.name = this.lesxParseElementName();
            while (!this.match(tt.slash) && !this.match(tt.lesxTagEnd)) {
                node.attributes.push(this.lesxParseAttribute());
            }
            node.selfClosing = this.eat(tt.slash);
            this.expect(tt.lesxTagEnd);
            return this.finishNode(node, "LesxOpeningElement");
        }

        // Parses Lesx closing tag starting after "</".

        lesxParseClosingElementAt(
            startPos: number,
            startLoc: Position,
        ): N.LesxClosingElement {
            const node = this.startNodeAt(startPos, startLoc);
            node.name = this.lesxParseElementName();
            this.expect(tt.lesxTagEnd);
            return this.finishNode(node, "LesxClosingElement");
        }

        // Parses entire Lesx element, including it"s opening tag
        // (starting after "<"), attributes, contents and closing tag.

        lesxParseElementAt(startPos: number, startLoc: Position): N.LesxElement {
            const node = this.startNodeAt(startPos, startLoc);
            const children = [];
            const openingElement = this.lesxParseOpeningElementAt(startPos, startLoc);
            let closingElement = null;

            const openingElementTagName = openingElement.name.name;


            if (!openingElement.selfClosing) {
                contents: for (;;) {
                    switch (this.state.type) {
                        case tt.lesxTagStart:
                            startPos = this.state.start;
                            startLoc = this.state.startLoc;
                            this.next();
                            if (this.eat(tt.slash)) {
                                closingElement = this.lesxParseClosingElementAt(
                                    startPos,
                                    startLoc,
                                );
                                break contents;
                            }
                            children.push(this.lesxParseElementAt(startPos, startLoc));
                            break;

                        case tt.lesxText:
                            children.push(this.parseExprAtom());
                            break;

                        case tt.braceL:
                            if (this.lookahead().type === tt.ellipsis) {
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
                    getQualifiedLesxName(closingElement.name) !==
                    getQualifiedLesxName(openingElement.name)
                ) {
                    this.raise(
                        // $FlowIgnore
                        closingElement.start,
                        "Expected corresponding Lesx closing tag for <" +
                        getQualifiedLesxName(openingElement.name) +
                        ">",
                    );
                }
            }

            node.openingElement = openingElement;
            node.closingElement = closingElement;
            node.children = children;
            if (this.match(tt.relational) && this.state.value === "<") {
                this.raise(
                    this.state.start,
                    "Adjacent Lesx elements must be wrapped in an enclosing tag",
                );
            }
            return this.finishNode(node, "LesxElement");
        }

        // Parses entire Lesx element from current position.

        lesxParseElement(): N.LesxElement {
            const startPos = this.state.start;
            const startLoc = this.state.startLoc;
            this.next();
            return this.lesxParseElementAt(startPos, startLoc);
        }

        // ==================================
        // Overrides
        // ==================================

        parseExprAtom(refShortHandDefaultPos: ? Pos): N.Expression {
            if (this.match(tt.lesxText)) {
                return this.parseLiteral(this.state.value, "LesxText");
            } else if (this.match(tt.lesxTagStart)) {
                return this.lesxParseElement();
            } else {
                return super.parseExprAtom(refShortHandDefaultPos);
            }
        }

        readToken(code: number): void {
            if (this.state.inPropertyName) return super.readToken(code);

            const context = this.curContext();

            if (context === tc.j_expr) {
                return this.lesxReadToken();
            }

            if (context === tc.j_oTag || context === tc.j_cTag) {
                if (isIdentifierStart(code)) {
                    return this.lesxReadWord();
                }

                if (code === 62) {
                    if (this.state.value) {
                        this.__cur_tag = this.state.value;
                    }

                    ++this.state.pos;
                    return this.finishToken(tt.lesxTagEnd);
                }

                if ((code === 34 || code === 39) && context === tc.j_oTag) {
                    return this.lesxReadString(code);
                }
            }

            if (code === 60 && this.state.exprAllowed) {
                ++this.state.pos;
                return this.finishToken(tt.lesxTagStart);
            }

            return super.readToken(code);
        }

        updateContext(prevType: TokenType): void {
            if (this.match(tt.braceL)) {
                const curContext = this.curContext();
                if (curContext === tc.j_oTag) {
                    this.state.context.push(tc.braceExpression);
                } else if (curContext === tc.j_expr) {
                    this.state.context.push(tc.templateQuasi);
                } else {
                    super.updateContext(prevType);
                }
                this.state.exprAllowed = true;
            } else if (this.match(tt.slash) && prevType === tt.lesxTagStart) {
                this.state.context.length -= 2; // do not consider Lesx expr -> Lesx open tag -> ... anymore
                this.state.context.push(tc.j_cTag); // reconsider as closing tag context
                this.state.exprAllowed = false;
            } else {
                return super.updateContext(prevType);
            }
        }
    };
