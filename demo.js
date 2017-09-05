const {
    acornParse,
    babylonParse,
} = require('./');

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


/**
打印结果：

*/
