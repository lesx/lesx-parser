# lesx-parser

lesx DSL AST解析器。

## 配置项

### script

`暂不支持` 是否解析script标签里面的代码成AST，默认不解析。

### style

`暂不支持` 是否解析style标签内部的样式代码，默认不解析。

## TODO

- 目前`style`跟`script`标签默认都是按照`LesxText`文本类型来解析的，后期可以在`Compiler`层面实现对内部内容进一步的AST解析实现；当然也可以考虑在`parse`阶段自动解析掉，但是考虑到`style`可以指定语言(`css/sass/less`)，以及`script`标签内部js代码所使用到的js语法的不确定性（可能需要ES6/7/8的acorn特殊语法插件），所以到`Compiler`阶段traverse AST的时候实现解析会更合适一些，同时，也能保证parser的纯粹性。

## example

```javascript
const {
    acornParse,
    babylonParse,
} = require('lesx-parser');

require('colors');

const code = `
<style>
    a {
        color: #999;
    }
</style>

<template>
    <div>
        <a onClick={() => {
            alert(1);
        }}></a>
    </div>
</template>

<script>
    module.exports = {
        props: {},

        state: {},

        // React其他生命周期钩子函数
    };
</script>
`;

const acornTime = `acorn解析时长`.red;
console.time(acornTime);
const acornAst = acornParse(code);
console.timeEnd(acornTime);

const babylonTime = `babylon解析时长`.red;
console.time(babylonTime);
const babylonAst = babylonParse(code);
console.timeEnd(babylonTime);

console.log('acorn ast:'.blue, JSON.stringify(acornAst, null, 4));
console.log('babylon ast:'.blue, JSON.stringify(babylonAst, null, 4));
```


## AST规范

Lesx AST扩展了[ECMAScript 6th Edition (ECMA-262) ](http://www.ecma-international.org/ecma-262/6.0/)语法的PrimaryExpression部分：

## PrimaryExpression:

### LesxElement

## Elements

### LesxElement

- LesxSelfClosingElement 
- LesxOpeningElement LesxChildren(可选) LesxClosingElement  
(LesxOpeningElement跟LesxClosingElement的名字需要匹配)

### LesxSelfClosingElement

- < LesxElementName LesxAttributes(可选) />

### LesxOpeningElement

- < LesxElementName LesxAttributes(可选) >

### LesxClosingElement

- < / LesxElementName >

### LesxElementName

- LesxIdentifier
- LesxNamespacedName
- LesxMemberExpression

### LesxIdentifier

- IdentifierStart
- LesxIdentifier IdentifierPart
- LesxIdentifier 没空格或注释 -

### LesxNamespacedName

- LesxIdentifier : LesxIdentifier

### LesxMemberExpression

- LesxIdentifier . LesxIdentifier
- LesxMemberExpression . LesxIdentifier


## Attributes

### LesxAttributes

- LesxSpreadAttribute LesxAttributes(可选)
- LesxAttribute LesxAttributes(可选)

### LesxSpreadAttribute

- { ... AssignmentExpression }

### LesxAttribute

- LesxAttributeName LesxAttributeInitializer(可选)

### LesxAttributeName

- LesxIdentifier
- LesxNamespacedName

### LesxAttributeInitializer

- = LesxAttributeValue

### LesxAttributeValue

- " LesxDoubleStringCharacters(可选) "
- ' LesxSingleStringCharacters(可选) '
- { AssignmentExpression }
- LesxElement

### LesxDoubleStringCharacters

- LesxDoubleStringCharacter LesxDoubleStringCharacters(可选)

### LesxDoubleStringCharacter

- SourceCharacter but not "

### LesxSingleStringCharacters

- LesxSingleStringCharacter LesxSingleStringCharacters(可选)


### LesxSingleStringCharacter

- SourceCharacter but not '

## Children

### LesxChildren

- LesxChild LesxChildren(可选)

### LesxChild

- LesxText
- LesxElement
- { LesxChildExpression(可选) }

### LesxText

- LesxTextCharacter LesxText(可选)

### LesxTextCharacter

- SourceCharacter 但不是以下几种 {, <, > or }

### LesxChildExpression

- AssignmentExpression
- ... AssignmentExpression

## Whitespace 以及 Comments

Lesx使用跟`ECMAScript`相同的`标点符号`以及`括号`。 `空白符`, `换行符`以及`注释`可以放在任意的标点符号之间。
