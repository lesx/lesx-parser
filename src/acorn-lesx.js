'use strict';

require('colors');

// 符号标识
var XHTMLEntities = require('./xhtml');

// 数字与字母的集合
var hexNumber = /^[da-fA-F]+$/;
var decimalNumber = /^d+$/; // 纯数字

const specTags = ['style', 'script'];

// acorn插件扩展机制，必要的时候需要扩展TokenType跟TokContext
function getTt(acorn, tc) {
    const tt = acorn.tokTypes;

    tt.lesxName = new acorn.TokenType('lesxName'); // 标签名
    tt.lesxText = new acorn.TokenType('lesxText', {beforeExpr: true}); // 文本
    tt.lesxTagStart = new acorn.TokenType('lesxTagStart'); // 开始标签
    tt.lesxTagEnd = new acorn.TokenType('lesxTagEnd'); // 结束标签

    // 解析到开始/结束标签的时候更新context状态
    // 只是一个辅助
    tt.lesxTagStart.updateContext = function() {
        this.context.push(tc.j_expr); // 认为是标签解析的开始

        this.context. // 开始打开标签上下文
        push(tc.j_oTag); // start opening tag context

        this.exprAllowed = false; // 允许正则
    };

    // 解析到结束标签的时候更新context状态
    tt.lesxTagEnd.updateContext = function(prevType) {
        var out = this.context.pop(); // 栈结构，解析完一个就吐出上一个

        // <tag />或者</tag>的情形 prevType是/
        if (out === tc.j_oTag && prevType === tt.slash || out === tc.j_cTag) {
            this.context.pop();

            this.exprAllowed = this.curContext() === tc.j_expr; // 标签之间的内容部分是允许有正则表达式的
        } else {
            this.exprAllowed = true;
        }
    };

    return tt;
}

function getTc(acorn) {
    const tc = acorn.tokContexts; // 上下文Context对象

    // 定义一些token，然后改写acorn.Parser.prototype的方法，
    // acorn会优先调用插件的实现，解析不通的时候再采用自己的实现
    // token, isExpr, preserveSpace
    tc.j_oTag = new acorn.TokContext('<tag', false); // 开始标签
    tc.j_cTag = new acorn.TokContext('</tag', false); // 结束标签
    tc.j_expr = new acorn.TokContext('<tag>...</tag>', true, true); // 整个的标签

    return tc;
}

module.exports = acorn => {
    const tc = getTc(acorn);
    const tt = getTt(acorn, tc);

    // 在acorn.Parser的原型链上扩展方法方便后面在instance.extend的第二个函数参数里直接使用，进而实现插件机制
    // 拿到配置数据：this.options.plugins.lesx
    Object.assign(acorn.Parser.prototype, {
        // Reads inline Lesx contents token.
        // 阅读行内lesx内容
        lesx_readToken() {
            var out = '';
            var chunkStart = this.pos; // 当前解析到的位置

            for (;;) {
                // 没有结束的Lesx内容
                if (this.pos >= this.input.length) {
                    this.raise(this.start, 'Unterminated Lesx contents');
                }

                // 获取当前位置的字符
                var ch = this.input.charCodeAt(this.pos);

                switch (ch) {
                    case 38: // '&'
                        out += this.input.slice(chunkStart, this.pos);
                        out += this.lesx_readEntity();
                        chunkStart = this.pos;
                        break;

                    case 60: // '<'
                    case 123: // '{'
                        if(ch === 60 || !specTags.includes(this.__cur_tag)) {
                            // ch是{的时候，只有在当前标签不是特殊标签的时候才执行
                            if (this.pos === this.start) { // 结束标签或自闭和标签的位置
                                if (ch === 60 && this.exprAllowed) {
                                    ++this.pos;
                                    return this.finishToken(tt.lesxTagStart);
                                }
                                return this.getTokenFromCode(ch);
                            }

                            out += this.input.slice(chunkStart, this.pos);

                            return this.finishToken(tt.lesxText, out);
                        }

                    default:
                        if (acorn.isNewLine(ch)) {
                            out += this.input.slice(chunkStart, this.pos);
                            out += this.lesx_readNewLine(true);
                            chunkStart = this.pos;
                        } else {
                            ++this.pos;
                        }
                }
            }
        },

        // 开始读取新的一行
        lesx_readNewLine(normalizeCRLF) {
            var ch = this.input.charCodeAt(this.pos);
            var out;

            ++this.pos;

            if (ch === 13 && this.input.charCodeAt(this.pos) === 10) {
                ++this.pos;
                out = normalizeCRLF
                    ? '\n'
                    : '\r\n';
            } else {
                out = String.fromCharCode(ch);
            }

            if (this.options.locations) {
                ++this.curLine;
                this.lineStart = this.pos;
            }

            return out;
        },

        // 读取字符串
        lesx_readString(quote) {
            var out = '';
            var chunkStart = ++this.pos;

            for (;;) {
                if (this.pos >= this.input.length) {
                    this.raise(this.start, 'Unterminated string constant');
                }

                var ch = this.input.charCodeAt(this.pos);

                if (ch === quote) {
                    break;
                }

                if (ch === 38) { // '&'
                    out += this.input.slice(chunkStart, this.pos);
                    out += this.lesx_readEntity();
                    chunkStart = this.pos;
                } else if (acorn.isNewLine(ch)) {
                    out += this.input.slice(chunkStart, this.pos);
                    out += this.lesx_readNewLine(false);
                    chunkStart = this.pos;
                } else {
                    ++this.pos;
                }
            }

            out += this.input.slice(chunkStart, this.pos++);

            return this.finishToken(tt.string, out);
        },

        // 读取实例
        lesx_readEntity() {
            var str = '',
                count = 0,
                entity;
            var ch = this.input[this.pos];

            if (ch !== '&') {
                this.raise(this.pos, 'Entity must start with an ampersand');
            }

            var startPos = ++this.pos;

            while (this.pos < this.input.length && count++ < 10) {
                ch = this.input[this.pos++];

                if (ch === ';') {
                    if (str[0] === '#') {
                        if (str[1] === 'x') {
                            str = str.substr(2);

                            if (hexNumber.test(str)) {
                                entity = String.fromCharCode(parseInt(str, 16));
                            }
                        } else {
                            str = str.substr(1);
                            if (decimalNumber.test(str)) {
                                entity = String.fromCharCode(parseInt(str, 10));
                            }
                        }
                    } else {
                        entity = XHTMLEntities[str];
                    }

                    break;
                }
                str += ch;
            }

            if (!entity) {
                this.pos = startPos;
                return '&';
            }

            return entity;
        },

        // Read a Lesx identifier (valid tag or attribute name).
        //
        // Optimized version since Lesx identifiers can't contain escape characters and
        // so can be read as single slice. Also assumes that first character was already
        // checked by isIdentifierStart in readToken.

        // 标签名或属性名
        lesx_readWord() {
            var ch,
                start = this.pos;

            do {
                ch = this.input.charCodeAt(++this.pos);
            } while (acorn.isIdentifierChar(ch) || ch === 45); // '-'

            return this.finishToken(tt.lesxName, this.input.slice(start, this.pos));
        },

        // Parse next token as Lesx identifier
        lesx_parseIdentifier() {
            var node = this.startNode();
            if (this.type === tt.lesxName) {
                node.name = this.value;
            } else if (this.type.keyword) {
                node.name = this.type.keyword;
            } else {
                this.unexpected();
            }

            this.next();

            return this.finishNode(node, 'LesxIdentifier');
        },

        // Parse namespaced identifier. 解析带有命名空间的标识符

        lesx_parseNamespacedName() {
            var startPos = this.start,
                startLoc = this.startLoc;
            var name = this.lesx_parseIdentifier();
            if (!this.options.plugins.lesx.allowNamespaces || !this.eat(tt.colon)) {
                return name;
            }
            var node = this.startNodeAt(startPos, startLoc);
            node.namespace = name;
            node.name = this.lesx_parseIdentifier();
            return this.finishNode(node, 'LesxNamespacedName');
        },

        // Parses element name in any form - namespaced, member or single identifier.
        // 解析元素名统一函数
        lesx_parseElementName() {
            var startPos = this.start,
                startLoc = this.startLoc;
            var node = this.lesx_parseNamespacedName();

            if (this.type === tt.dot && node.type === 'LesxNamespacedName' && !this.options.plugins.lesx.allowNamespacedObjects) {
                this.unexpected();
            }

            while (this.eat(tt.dot)) {
                var newNode = this.startNodeAt(startPos, startLoc);
                newNode.object = node;
                newNode.property = this.lesx_parseIdentifier();
                node = this.finishNode(newNode, 'LesxMemberExpression');
            }

            return node;
        },

        // Parses any type of Lesx attribute value.
        // 解析属性值
        lesx_parseAttributeValue() {
            switch (this.type) {
                case tt.braceL:
                    var node = this.lesx_parseExpressionContainer();
                    if (node.expression.type === 'LesxEmptyExpression')
                        this.raise(node.start, 'Lesx attributes must only be assigned a non-empty expression');
                    return node;

                case tt.lesxTagStart:
                case tt.string:
                    return this.parseExprAtom();

                default:
                    this.raise(this.start, 'Lesx value should be either an expression or a quoted Lesx text');
            }
        },

        // LesxEmptyExpression is unique type since it doesn't actually parse anything,
        // and so it should start at the end of last read token (left brace) and finish
        // at the beginning of the next one (right brace).

        lesx_parseEmptyExpression() {
            var node = this.startNodeAt(this.lastTokEnd, this.lastTokEndLoc);
            return this.finishNodeAt(node, 'LesxEmptyExpression', this.start, this.startLoc);
        },

        // Parses Lesx expression enclosed into curly brackets.
        // 解析Lesx大括号中的表达式
        lesx_parseExpressionContainer() {
            var node = this.startNode();
            this.next();
            node.expression = this.type === tt.braceR
                ? this.lesx_parseEmptyExpression()
                : this.parseExpression();
            this.expect(tt.braceR);
            return this.finishNode(node, 'LesxExpressionContainer');
        },

        // Parses following Lesx attribute name-value pair.
        // 解析Lesx键值对的属性
        lesx_parseAttribute() {
            var node = this.startNode();

            if (this.eat(tt.braceL)) {
                this.expect(tt.ellipsis);
                node.argument = this.parseMaybeAssign();
                this.expect(tt.braceR);
                return this.finishNode(node, 'LesxSpreadAttribute');
            }

            node.name = this.lesx_parseNamespacedName();
            node.value = this.eat(tt.eq)
                ? this.lesx_parseAttributeValue()
                : null;

            return this.finishNode(node, 'LesxAttribute');
        },

        // Parses Lesx opening tag starting after '<'.
        // 解析Lesx开始标签
        lesx_parseOpeningElementAt(startPos, startLoc) {
            var node = this.startNodeAt(startPos, startLoc);
            node.attributes = [];
            node.name = this.lesx_parseElementName();

            while (this.type !== tt.slash && this.type !== tt.lesxTagEnd) {
                node.attributes.push(this.lesx_parseAttribute());
            }

            node.selfClosing = this.eat(tt.slash);

            this.expect(tt.lesxTagEnd);

            return this.finishNode(node, 'LesxOpeningElement');
        },

        // Parses Lesx closing tag starting after '</'.
        // 解析Lesx闭合标签</之后的内容
        lesx_parseClosingElementAt(startPos, startLoc) {
            var node = this.startNodeAt(startPos, startLoc);
            node.name = this.lesx_parseElementName();
            this.expect(tt.lesxTagEnd);
            return this.finishNode(node, 'LesxClosingElement');
        },

        // Parses entire Lesx element, including it's opening tag (starting after '<'),
        // attributes, contents and closing tag.
        // 解析整个的Lesx元素，包括开始标签、元素属性、内容以及闭合标签
        // 并组装Node节点
        lesx_parseElementAt(startPos, startLoc) {
            const node = this.startNodeAt(startPos, startLoc);
            const children = [];
            const openingElement = this.lesx_parseOpeningElementAt(startPos, startLoc);
            let closingElement = null;

            const openingElementTagName = openingElement.name.name;

            if (!openingElement.selfClosing) { // 非自闭和
                contents : for (;;) {
                    switch (this.type) {
                        case tt.lesxTagStart: // <
                            startPos = this.start;
                            startLoc = this.startLoc;

                            this.next(); // 开始走下一个token的解析

                            if (this.eat(tt.slash)) { // 说明是闭合标签
                                closingElement = this.lesx_parseClosingElementAt(startPos, startLoc);
                                break contents;
                            }

                            children.push(this.lesx_parseElementAt(startPos, startLoc));

                            break;

                        case tt.lesxText: // 文本
                            children.push(this.parseExprAtom());
                            break;

                        case tt.braceL: // 大括号
                            children.push(specTags.includes(openingElementTagName) ? this.parseExprAtom() : this.lesx_parseExpressionContainer());
                            break;

                        default: // 未预期
                            this.unexpected();
                    }
                }

                if (getQualifiedLesxName(closingElement.name) !== getQualifiedLesxName(openingElement.name)) {
                    this.raise(closingElement.start, 'Expected corresponding Lesx closing tag for <' + getQualifiedLesxName(openingElement.name) + '>');
                }
            }

            node.openingElement = openingElement;
            node.closingElement = closingElement;
            node.children = children;

            if (this.type === tt.relational && this.value === "<") {
                this.raise(this.start, "Adjacent Lesx elements must be wrapped in an enclosing tag");
            }

            return this.finishNode(node, 'LesxElement');
        },

        // Parse Lesx text
        lesx_parseText(value) {
            var node = this.parseLiteral(value); // TODO: 要改
            node.type = "LesxText";

            return node;
        },

        // Parses entire Lesx element from current position.
        lesx_parseElement() {
            var startPos = this.start,
                startLoc = this.startLoc;

            this.next();

            return this.lesx_parseElementAt(startPos, startLoc);
        }
    });

    // 将Lesx放进acorn的plugins里面
    acorn.plugins.lesx = function(instance, opts) {
        if (!opts) {
            return; // 所以必须配置lesx:true选项
        }

        if (typeof opts !== 'object') {
            opts = {}; // 初始化opts为对象
        }

        // 设置lesx插件的基础配置
        instance.options.plugins.lesx = Object.assign({}, opts, {
            allowNamespaces: opts.allowNamespaces !== false,
            allowNamespacedObjects: !!opts.allowNamespacedObjects
        });

        // 解析一个原子表达式 - 一个符号也是一个表达式，以function、new等关键字开头的也是一个表达式，包裹在(), [], {}中的也是
        instance.extend('parseExprAtom', function(inner) {
            return function(refShortHandDefaultPos) {
                if (this.type === tt.lesxText) { // lesx文本
                    return this.lesx_parseText(this.value);
                } else if (this.type === tt.lesxTagStart) { // lesx元素
                    return this.lesx_parseElement();
                } else {
                    return inner.call(this, refShortHandDefaultPos);
                }
            };
        });

        const extendObj = {
            // Identifier or keyword 标识符或者关键字
            // 一个token接一个token的解析
            readToken(inner) {
                // Unicode编码单元的范围从0到1114111，开头的128个Unicode编码单元跟ASCII字符编码一样
                return function(code) { // code是this.input当前位置(this.pos)的Unicode编码：this.input.charCodeAt(this.pos)
                    var context = this.curContext(); // 获取当前上下文

                    if (context === tc.j_expr) { // 解析到开始标签的 > 符号以及标签之间的文本的时候
                        return this.lesx_readToken();
                    }

                    // 解析到开始标签的<或者标签名，以及结束标签“</div”的三种token情形
                    if (context === tc.j_oTag || context === tc.j_cTag) {
                        // 三种：开始标签<以及有属性的标签名，结束标签的/，很明显这种后面带的就是可以认为是标识符的固定名字
                        if (acorn.isIdentifierStart(code)) {
                            return this.lesx_readWord();
                        }

                        // 开始标签：有属性的时候，是在所有属性解析结束后，否则是在开始标签名解析结束后
                        // 结束标签名解析后
                        if (code == 62) {
                            ++this.pos;

                            if(this.value) {
                                this.__cur_tag = this.value;
                            }

                            return this.finishToken(tt.lesxTagEnd);
                        }

                        // 标签属性值是字符串
                        if ((code === 34 || code === 39) && context == tc.j_oTag) {
                            return this.lesx_readString(code);
                        }
                    }

                    // 当前被解析的符号是< 且 允许正则 且 下一个字符不是!(不是注释标签)
                    // 刚开始解析标签的地方会用到
                    if (code === 60 && this.exprAllowed && this.input.charCodeAt(this.pos + 1) !== 33) {
                        ++this.pos;
                        return this.finishToken(tt.lesxTagStart);
                    }

                    return inner.call(this, code);
                }
            },

            updateContext(inner) {
                return function(prevType) {
                    // {
                    if (this.type == tt.braceL) {
                        var curContext = this.curContext(); // 获取当前context

                        if (curContext == tc.j_oTag) {
                            this.context.push(tc.b_expr); // 标签的属性值里的{，将 { push进context
                        } else if (curContext == tc.j_expr) {
                            this.context.push(tc.b_tmpl); // 标签内部的，将  push进context
                        } else {
                            inner.call(this, prevType);
                        }

                        this.exprAllowed = true;
                    } else if (this.type === tt.slash && prevType === tt.lesxTagStart) { // 结束标签
                        this.context.length -= 2; // do not consider Lesx expr -> Lesx open tag -> ... anymore

                        this.context.push(tc.j_cTag); // reconsider as closing tag context

                        this.exprAllowed = false;
                    } else {
                        return inner.call(this, prevType);
                    }
                };
            }
        };

        Object.keys(extendObj).forEach(key => {
            instance.extend(key, extendObj[key]);
        });
    };

    return acorn;
};

// ### helpers ###

// Transforms Lesx element name to string.
function getQualifiedLesxName(object) {
    if (object.type === 'LesxIdentifier') {
        return object.name;
    }

    if (object.type === 'LesxNamespacedName') {
        return object.namespace.name + ':' + object.name.name;
    }

    if (object.type === 'LesxMemberExpression') {
        return getQualifiedLesxName(object.object) + '.' + getQualifiedLesxName(object.property);
    }
}
