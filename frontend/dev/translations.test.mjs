import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {catalogError, errorCode} from '../js/plugins/kartenkatalog/errors.mjs';
import {prepareCatalog} from '../js/plugins/kartenkatalog/catalog.mjs';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const languages = JSON.parse(read('static/translations/tsconfig.json')).languages;
const translations = Object.fromEntries(languages.map(lang => [lang, JSON.parse(read(`static/translations/${lang}.json`)).messages]));
function flatten(object, prefix = '') {
    return Object.fromEntries(Object.entries(object).flatMap(([key, value]) => {
        const name = prefix ? `${prefix}.${key}` : key;
        return typeof value === 'string' ? [[name, value]] : Object.entries(flatten(value, name));
    }));
}
const flat = Object.fromEntries(languages.map(lang => [lang, flatten(translations[lang])]));
const source = read('js/plugins/Kartenkatalog.jsx');
const referencedKeys = [...source.matchAll(/LocaleUtils\.tr\('([^']+)'/g)].map(match => match[1]);

test('every catalog translation is present in all configured languages with matching placeholders', () => {
    const expected = Object.keys(flat['de-CH']).filter(key => key.startsWith('kartenkatalog.')).sort();
    assert.ok(expected.length > 0);
    for (const lang of languages) {
        assert.deepEqual(Object.keys(flat[lang]).filter(key => key.startsWith('kartenkatalog.')).sort(), expected);
        for (const key of [...expected, 'appmenu.items.Kartenkatalog']) {
            assert.ok(flat[lang][key]?.trim(), `${lang}: ${key}`);
            assert.deepEqual([...flat[lang][key].matchAll(/\{\d+\}/g)].map(match => match[0]).sort(),
                [...flat['de-CH'][key].matchAll(/\{\d+\}/g)].map(match => match[0]).sort(), `${lang}: ${key}`);
        }
    }
    for (const key of referencedKeys) for (const lang of languages) assert.ok(flat[lang][key], `${lang}: ${key}`);
    for (const key of expected) assert.ok(referencedKeys.includes(key), `Not discoverable by QWC tsupdate: ${key}`);
});
test('catalog JSX has no untranslated UI text or string labels', () => {
    const tree = parse(source, {sourceType: 'module', plugins: ['jsx']});
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'JSXText') assert.match(node.value.trim(), /^%?$/, `Untranslated text: ${node.value}`);
        if (node.type === 'JSXAttribute' && ['title', 'aria-label', 'placeholder'].includes(node.name.name)) {
            assert.notEqual(node.value?.type, 'StringLiteral', `Untranslated ${node.name.name}`);
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === 'object') walk(value);
        }
    }
    walk(tree);
});
test('known error codes select translations and unknown errors use the caller fallback', () => {
    const codes = Object.keys(translations['de-CH'].kartenkatalog.errors);
    for (const code of codes) {
        const error = catalogError(code);
        assert.ok(error instanceof Error);
        assert.equal(errorCode(error, 'addFailed'), code);
        for (const lang of languages) assert.ok(flat[lang][`kartenkatalog.errors.${code}`]);
    }
    for (const error of [new Error('private upstream detail'), {code: 'ECONNABORTED'}, {code: '__proto__'}, null]) {
        assert.equal(errorCode(error, 'addFailed'), 'addFailed');
        assert.equal(errorCode(error, 'catalogLoadFailed'), 'catalogLoadFailed');
    }
});
test('invalid catalog structures produce stable codes instead of localized errors', () => {
    assert.throws(() => prepareCatalog({}), {code: 'catalogInvalid'});
    assert.throws(() => prepareCatalog({themes: [{theme: {}, layers: []}]}), {code: 'themesInvalid'});
    assert.throws(() => prepareCatalog({themes: [{theme: {identifier: 'x', title: 'X'}, layers: [{}]}]}), {code: 'layersInvalid'});
});
