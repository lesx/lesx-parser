'use strict';

const acorn = require('./lib/acorn-lesx')(require('acorn'));
const babylonLesx = require('./lib/babylon-lesx');

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
    
    const res = babylonLesx.parse(code, Object.assign({
        // parse in strict mode and allow module declarations
        sourceType: "module",

        plugins: [
            // enable lesx and flow syntax
            'lesx',
            "flow"
        ]
    }, opts));

    return res;
};
