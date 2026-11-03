import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayerController} from '../js/plugins/kartenkatalog/layers.mjs';
import {createPreviewController, PREVIEW_ID} from '../js/plugins/kartenkatalog/preview.mjs';
import {buildPreviewLayer, previewLayerVisible} from '../js/plugins/kartenkatalog/previewLayer.mjs';

const entry = {qwcLayerName: 'a', title: 'A', type: 'datasetview'};
function harness(resolve = async name => [{name, opacity: 153}]) {
    const state = {theme: {current: {url: '/wms', sublayers: []}, themes: {}}, layers: {flat: []}};
    const actions = [];
    const timers = new Map();
    let serial = 0;
    const groups = [];
    const controller = createLayerController({resolve, baseUrl: 'http://localhost/',
        createLayer: (theme, themes, nodes) => ({id: 'permanent', url: theme.url, role: 2, type: 'wms', sublayers: nodes}),
        addLayer: layer => ({type: 'ADD', layer})});
    const dispatch = action => {
        actions.push(action);
        if (action.type === 'ADD') state.layers.flat.push(action.layer);
        else if (action.type === 'REMOVE') state.layers.flat = state.layers.flat.filter(layer => layer.id !== action.id);
    };
    const getState = () => state;
    const preview = createPreviewController({controller,
        createLayer: (item, nodes) => ({id: PREVIEW_ID, type: 'wms', role: 4, sublayers: structuredClone(nodes)}),
        showLayer: layer => ({type: 'ADD', layer}), removeLayer: id => ({type: 'REMOVE', id}),
        onGroup: item => groups.push(item.qwcLayerName),
        schedule: (callback, delay) => { assert.equal(delay, 150); timers.set(++serial, callback); return serial; },
        cancel: id => timers.delete(id)});
    return {state, actions, controller, groups, timers, dispatch,
        start: (item = entry) => preview.start(item, dispatch, getState),
        clear: item => preview.clear(dispatch, item),
        reconcile: () => preview.reconcile(dispatch, getState),
        add: () => controller.add(entry, dispatch, getState),
        run: () => { const [id, callback] = timers.entries().next().value; timers.delete(id); return callback(); }};
}

test('preview waits 150ms, cancels quick hover, stays separate from permanent layer status and clears only its own ID', async () => {
    let requests = 0;
    const h = harness(async name => { requests++; return [{name}]; });
    h.state.layers.flat.push({id: 'unrelated', role: 3, type: 'wms', url: '/other'});
    h.start();
    assert.equal(requests, 0);
    h.clear();
    assert.equal(h.timers.size, 0);
    assert.equal(h.actions.length, 0);
    h.start(); await h.run();
    assert.equal(h.state.layers.flat.length, 2);
    assert.equal(h.controller.status(entry, h.state), 'missing');
    h.clear({qwcLayerName: 'other'});
    assert.equal(h.state.layers.flat.length, 2);
    h.clear();
    assert.deepEqual(h.state.layers.flat.map(layer => layer.id), ['unrelated']);
    h.clear();
    assert.equal(h.actions.filter(action => action.type === 'REMOVE').length, 1);
    h.start(); await h.run();
    assert.equal(requests, 1);
});

test('late responses and late errors from A cannot replace or clear preview B', async () => {
    for (const rejectA of [false, true]) {
        let completeA, failA;
        const h = harness(name => name === 'a' ? new Promise((resolve, reject) => { completeA = resolve; failA = reject; }) : Promise.resolve([{name}]));
        h.start(); const a = h.run();
        h.start({...entry, qwcLayerName: 'b'}); await h.run();
        if (rejectA) failA(new Error('offline'));
        else completeA([{name: 'a'}]);
        await a;
        assert.deepEqual(h.state.layers.flat.map(layer => layer.sublayers[0].name), ['b']);
    }
});

test('clear and theme change during resolution prevent stale previews', async () => {
    for (const changeTheme of [false, true]) {
        let complete;
        const h = harness(() => new Promise(resolve => { complete = resolve; }));
        h.start(); const operation = h.run();
        if (changeTheme) h.state.theme.current = {...h.state.theme.current};
        else h.clear();
        complete([{name: 'a'}]); await operation;
        assert.equal(h.actions.length, 0);
    }
    const h = harness();
    h.start(); await h.run();
    h.state.theme.current = {...h.state.theme.current}; h.reconcile();
    assert.equal(h.state.layers.flat.length, 0);
});

test('declared groups do not load; discovered groups are cached and reported without rendering', async () => {
    let requests = 0;
    const h = harness(async () => { requests++; return [{name: 'group', sublayers: [{name: 'a'}, {name: 'b'}]}]; });
    h.start({...entry, type: 'layergroup'});
    assert.equal(h.timers.size, 0);
    h.start(); await h.run();
    assert.deepEqual(h.groups, ['a']);
    assert.equal(h.state.layers.flat.length, 0);
    assert.equal(h.controller.isGroup(entry, h.state.theme.current), true);
    h.start();
    assert.equal(h.timers.size, 0);
    assert.equal(requests, 1);
});

test('visible layers skip previews; hidden layers remain unchanged; adding shares in-flight resolution', async () => {
    const h = harness();
    h.state.layers.flat = [{id: 'hidden', type: 'wms', role: 2, url: '/wms', visibility: false, sublayers: [{name: 'a', opacity: 77}]}];
    h.start(); await h.run();
    assert.equal(h.state.layers.flat[0].visibility, false);
    assert.equal(h.state.layers.flat[0].sublayers[0].opacity, 77);
    h.clear();
    h.state.layers.flat[0].visibility = true;
    h.start(); assert.equal(h.timers.size, 0);

    let complete, requests = 0;
    const concurrent = harness(() => { requests++; return new Promise(resolve => { complete = resolve; }); });
    concurrent.start(); const hovering = concurrent.run();
    concurrent.clear(); const adding = concurrent.add();
    complete([{name: 'a'}]); await Promise.all([hovering, adding]);
    assert.equal(requests, 1);
    assert.deepEqual(concurrent.state.layers.flat.map(layer => layer.id), ['permanent']);
});

const adapter = {
    role: 4,
    createThemeLayer: (theme, themes, role, sublayers) => ({...theme, type: 'wms', role, sublayers}),
    completeExternalLayer: layer => { layer.version ??= '1.3.0'; }
};
test('native preview definition preserves source style, opacity and scale without mutating its theme', () => {
    const nodes = [{name: 'a', visibility: false, opacity: 153, style: 'test', minScale: 25000, maxScale: 1000, editConfigUrl: '/edit'}];
    const state = {theme: {current: {id: 'theme', url: '/wms', sublayers: nodes, editConfigUrl: '/edit'}, themes: {}}};
    const before = structuredClone(state);
    const layer = buildPreviewLayer(entry, nodes, state, adapter);
    assert.deepEqual(state, before);
    assert.equal(layer.sublayers[0].visibility, true);
    assert.equal(layer.sublayers[0].opacity, 153);
    assert.equal(layer.sublayers[0].style, 'test');
    assert.equal(layer.minScale, 25000);
    assert.equal(layer.maxScale, 1000);
    assert.equal(layer.id, PREVIEW_ID);
    assert.equal(layer.srcid, PREVIEW_ID);
    assert.equal(layer.role, 4);
    assert.equal(layer.layertreehidden, true);
    assert.equal(layer.editConfigUrl, undefined);
    assert.deepEqual(layer.queryLayers, []);
});

test('external WMS/WMTS are completed as independent layers and already-visible sources are recognized', () => {
    for (const type of ['wms', 'wmts']) {
        const external = {type, url: 'https://external.example/wms', name: 'external', params: {LAYERS: 'external', STYLES: 'style'}};
        const nodes = [{name: 'a', opacity: 127, externalLayer: external}];
        const state = {theme: {current: {url: '/wms'}, themes: {}}, layers: {flat: []}};
        const layer = buildPreviewLayer(entry, nodes, state, adapter);
        assert.equal(layer.type, type);
        assert.equal(layer.opacity, 127);
        assert.equal(layer.params.STYLES, 'style');
        assert.equal(external.version, undefined);
        assert.equal(previewLayerVisible(layer, state, 'http://localhost/'), false);
        state.layers.flat = [{...external, role: 3, id: 'permanent'}];
        assert.equal(previewLayerVisible(layer, state, 'http://localhost/'), true);
        state.layers.flat[0].visibility = false;
        assert.equal(previewLayerVisible(layer, state, 'http://localhost/'), false);
        state.layers.flat = [{...layer}];
        assert.equal(previewLayerVisible(layer, state, 'http://localhost/'), false);
    }
});

test('groups with duplicate leaf names remain groups and external maps on the theme are supported', async () => {
    const h = harness(async () => [{name: 'group', sublayers: [{name: 'a'}, {name: 'a'}]}]);
    h.start(); await h.run();
    assert.deepEqual(h.groups, ['a']);
    assert.equal(h.controller.isGroup(entry, h.state.theme.current), true);
    const state = {theme: {current: {url: '/wms', externalLayerMap: {
        a: {type: 'wmts', url: 'https://example.test/tiles', name: 'external'}
    }}, themes: {}}};
    const layer = buildPreviewLayer(entry, [{name: 'a', opacity: 180}], state, adapter);
    assert.equal(layer.type, 'wmts');
    assert.equal(layer.opacity, 180);
    assert.equal(layer.id, PREVIEW_ID);
});

test('failed previews are silent and retryable; a permanent add removes an existing preview through reconciliation', async () => {
    let requests = 0;
    const h = harness(async name => {
        if (++requests === 1) throw new Error('unavailable');
        return [{name}];
    });
    h.start(); await h.run();
    assert.equal(h.actions.length, 0);
    h.start(); await h.run();
    assert.equal(h.state.layers.flat[0].id, PREVIEW_ID);
    await h.add();
    h.reconcile();
    assert.deepEqual(h.state.layers.flat.map(layer => layer.id), ['permanent']);
    assert.equal(requests, 2);
});
