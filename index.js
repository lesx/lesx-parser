'use strict';

const acorn = require('./src/acorn-lesx')(require('acorn'));
const babylon = require('./lib/babylon-lesx');

exports.acornParse = (code, opts = {}) => {
    code = `<span>${code}</span>`;
    
    return acorn.parse(code, {
        plugins: {
            lesx: opts
        }
    });
};

exports.babylonParse = (code, opts = {}) => {
    code = `<span>${code}</span>`;
    
    const res = babylon.parse(code, Object.assign({
        // parse in strict mode and allow module declarations
        sourceType: "module",

        plugins: [
            // enable jsx and flow syntax
            'jsx',
            "flow"
        ]
    }, opts));

    return res;
};

exports.babylon = babylon;
