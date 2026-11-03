import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareCatalog, filterCatalog, safeLink} from '../js/plugins/kartenkatalog/catalog.mjs';
import {createLayerController} from '../js/plugins/kartenkatalog/layers.mjs';

const entry = {id: 'ch.so.test', qwcLayerName: 'ch.so.test', title: 'Gewässerschutz', description: 'Grundwasser', keywords: ['Wasser'], synonyms: ['Trinkwasser']};
test('catalog searches descriptions, themes, keywords, synonyms and accents without changing source', () => {
    const source = {themes: [{theme: {identifier: 'nature', title: 'Natur und Umwelt'}, layers: [entry]}]};
    const catalog = prepareCatalog(source);
    for (const query of ['GEWASSER', 'trinkwasser', 'Grundwasser', 'Umwelt Wasser']) assert.equal(filterCatalog(catalog, query)[0].layers.length, 1);
    assert.equal(filterCatalog(catalog, 'no match').length, 0);
    assert.equal(source.themes[0].layers[0].searchText, undefined);
    assert.throws(() => prepareCatalog({themes: [{theme: {}, layers: []}]}));
    assert.equal(safeLink('javascript:alert(1)'), null);
    assert.equal(safeLink('https://geo.so.ch/docs'), 'https://geo.so.ch/docs');
});
function harness(resolve = async () => [{name: entry.qwcLayerName, opacity: 178, visibility: true}]) {
    let state = {theme: {current: {id: 'default', url: '/ows/somap', sublayers: []}, themes: {}}, layers: {flat: []}};
    const actions = [];
    let count = 0;
    const controller = createLayerController({resolve, baseUrl: 'http://localhost:8082/map/',
        createLayer: (theme, themes, nodes) => ({id: `user-${++count}`, type: 'wms', url: theme.url, role: 3, visibility: true, sublayers: nodes}),
        addLayer: layer => ({type: 'ADD', layer}),
        removeLayer: (id, path) => ({type: 'REMOVE', id, path}),
        changeLayerProperty: (id, property, value, path, recurse) => ({type: 'CHANGE', id, property, value, path, recurse})});
    const dispatch = action => {
        actions.push(action);
        if (action.type === 'ADD') state.layers.flat.push(action.layer);
        if (action.type === 'REMOVE') {
            const layer = state.layers.flat.find(node => node.id === action.id);
            if (!action.path.length) state.layers.flat = state.layers.flat.filter(node => node !== layer);
            else {
                let parent = layer;
                for (const index of action.path.slice(0, -1)) parent = parent.sublayers[index];
                parent.sublayers.splice(action.path.at(-1), 1);
            }
        }
        if (action.type === 'CHANGE') {
            let node = state.layers.flat.find(layer => layer.id === action.id);
            node.visibility = true;
            for (const index of action.path) { node = node.sublayers[index]; node.visibility = true; }
        }
    };
    return {controller, actions, dispatch, get state() { return state; }, set state(value) { state = value; },
        remove: (layer = entry) => controller.remove(layer, dispatch, () => state),
        add: (layer = entry) => controller.add(layer, dispatch, () => state), status: (layer = entry) => controller.status(layer, state)};
}
test('adds via adapter once, preserves source opacity and does not create duplicates', async () => {
    let requests = 0;
    const h = harness(async () => { requests++; return [{name: entry.qwcLayerName, opacity: 178}]; });
    await Promise.all([h.add(), h.add()]);
    assert.equal(requests, 1);
    assert.equal(h.actions.filter(a => a.type === 'ADD').length, 1);
    assert.equal(h.state.layers.flat[0].sublayers[0].opacity, 178);
    assert.equal(h.status(), 'visible');
    await h.add();
    assert.equal(h.actions.filter(a => a.type === 'ADD').length, 1);
    h.state.layers.flat = [];
    assert.equal(h.status(), 'missing');
    await h.add();
    assert.equal(h.status(), 'visible');
});
test('hidden ancestors are activated using the actual sublayer path', async () => {
    const h = harness();
    h.state.layers.flat = [{id: 'existing', type: 'wms', role: 2, url: '/ows/somap', visibility: false,
        sublayers: [{name: 'group', visibility: false, sublayers: [{name: entry.qwcLayerName, visibility: true}]}]}];
    assert.equal(h.status(), 'hidden');
    await h.add();
    assert.deepEqual(h.actions[0], {type: 'CHANGE', id: 'existing', property: 'visibility', value: true, path: [0, 0], recurse: 'both'});
    assert.equal(h.status(), 'visible');
    assert.equal(h.state.layers.flat.length, 1);
});
test('groups only add missing members and recognize partial removal', async () => {
    const h = harness(async () => [{name: 'group', sublayers: [{name: 'a', opacity: 255}, {name: 'b', opacity: 127}]}]);
    h.state.layers.flat = [{id: 'first', type: 'wms', role: 3, url: '/ows/somap', sublayers: [{name: 'a'}]}];
    await h.add();
    const added = h.actions.find(a => a.type === 'ADD').layer;
    assert.deepEqual(added.sublayers[0].sublayers.map(n => n.name), ['b']);
    assert.equal(added.sublayers[0].sublayers[0].opacity, 127);
    assert.equal(h.status(), 'visible');
    h.state.layers.flat.pop();
    assert.equal(h.status(), 'partial');
});
test('different WMS with the same name is not treated as the current project', async () => {
    const h = harness();
    h.state.layers.flat = [{id: 'foreign', type: 'wms', role: 3, url: 'https://other.example/wms', sublayers: [{name: entry.qwcLayerName}]}];
    await h.add();
    assert.equal(h.state.layers.flat.length, 2);
});
test('theme changes during resolution discard the stale result', async () => {
    let complete;
    const h = harness(() => new Promise(resolve => { complete = resolve; }));
    const pending = h.add();
    h.state.theme.current = {...h.state.theme.current, id: 'other'};
    complete([{name: entry.qwcLayerName}]);
    await assert.rejects(pending, {code: 'themeChanged'});
    assert.equal(h.actions.length, 0);
});
test('unavailable and failing definitions are retryable without adding placeholders', async () => {
    let count = 0;
    const h = harness(async () => ++count === 1 ? [] : [{name: entry.qwcLayerName}]);
    await assert.rejects(h.add(), {code: 'layerUnavailable'});
    assert.equal(h.state.layers.flat.length, 0);
    await h.add();
    assert.equal(h.status(), 'visible');
});
test('concurrent group and member requests cannot add the member twice', async () => {
    for (const groupFirst of [false, true]) {
        const complete = {};
        const h = harness(name => new Promise(resolve => { complete[name] = resolve; }));
        const group = {...entry, id: 'group', qwcLayerName: 'group'};
        const memberPromise = h.add();
        const groupPromise = h.add(group);
        const memberNodes = [{name: entry.qwcLayerName}];
        const groupNodes = [{name: 'group', sublayers: [...memberNodes, {name: 'other'}]}];
        if (groupFirst) {
            complete.group(groupNodes); await groupPromise;
            complete[entry.qwcLayerName](memberNodes); await memberPromise;
        } else {
            complete[entry.qwcLayerName](memberNodes); await memberPromise;
            complete.group(groupNodes); await groupPromise;
        }
        const names = [];
        const walk = node => { if (node.name) names.push(node.name); for (const child of node.sublayers || []) walk(child); };
        h.state.layers.flat.forEach(walk);
        assert.equal(names.filter(name => name === entry.qwcLayerName).length, 1);
        assert.equal(h.status(group), 'visible');
    }
});

test('removes a layer without removing siblings or layers from another service, then allows readding', async () => {
    const h = harness();
    await h.add();
    h.state.layers.flat[0].sublayers.push({name: 'unrelated'});
    h.state.layers.flat.push({id: 'foreign', type: 'wms', role: 3, url: 'https://other.example/wms', sublayers: [{name: entry.qwcLayerName}]});
    h.remove();
    assert.equal(h.status(), 'missing');
    assert.deepEqual(h.state.layers.flat[0].sublayers.map(node => node.name), ['unrelated']);
    assert.equal(h.state.layers.flat[1].sublayers[0].name, entry.qwcLayerName);
    await h.add();
    assert.equal(h.status(), 'visible');
});
test('group removal recalculates sibling paths and removes all copies, including hidden members', async () => {
    const h = harness(async () => [{name: 'group', sublayers: [{name: 'a'}, {name: 'b'}]}]);
    const group = {...entry, qwcLayerName: 'group'};
    await h.add(group);
    h.state.layers.flat[0].sublayers[0].sublayers.push({name: 'unrelated'});
    h.state.layers.flat.push({id: 'copy', type: 'wms', role: 2, url: '/ows/somap', sublayers: [{name: 'a', visibility: false}]});
    h.remove(group);
    assert.equal(h.status(group), 'missing');
    assert.deepEqual(h.state.layers.flat[0].sublayers[0].sublayers.map(node => node.name), ['unrelated']);
    assert.equal(h.state.layers.flat[1].sublayers.length, 0);
    assert.equal(h.actions.filter(action => action.type === 'REMOVE').length, 3);
    h.remove(group);
    assert.equal(h.actions.filter(action => action.type === 'REMOVE').length, 3);
});
test('removes matching root layers and rejects removal without a current theme', () => {
    const h = harness();
    h.state.layers.flat = [{id: 'root', name: entry.qwcLayerName, type: 'wms', role: 3, url: '/ows/somap'}];
    h.remove();
    assert.deepEqual(h.state.layers.flat, []);
    h.state.theme.current = null;
    assert.throws(() => h.remove(), {code: 'mapNotReady'});
});
