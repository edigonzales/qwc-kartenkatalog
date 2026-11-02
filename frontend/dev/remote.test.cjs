const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {adaptConfig, rewriteUrls, allowed, createRemoteMiddleware} = require('./remote.cjs');
test('anonymous overlay preserves unrelated live settings and input', () => {
    const original = {username: 'private', plugins: {desktop: [{name: 'Map'}, {name: 'Editing'}, {name: 'Authentication'}]}, assetsPath: '/map/assets'};
    const result = adaptConfig(original);
    assert.equal(original.username, 'private');
    assert.equal(result.username, null);
    assert.deepEqual(result.plugins.desktop.map(p => p.name), ['Map', 'Kartenkatalog']);
    assert.equal(result.assetsPath, '/map/assets');
});
test('rewrite only live WMTS origin', () => {
    assert.deepEqual(rewriteUrls({url: 'https://geo.so.ch/api/wmts/{TileRow}', other: 'https://other.ch/api/wmts/x'}), {url: '/api/wmts/{TileRow}', other: 'https://other.ch/api/wmts/x'});
});
test('allowlist blocks writes and authentication', () => {
    assert.ok(allowed(new URL('https://localhost/ows/somap?REQUEST=GetMap'), 'GET'));
    for (const [route, method] of [['/api/data/v1/x', 'POST'], ['/auth/info', 'GET'], ['/ows/somap?request=Transaction', 'GET'], ['/api/dataproduct/v1/private', 'GET']]) assert.equal(allowed(new URL(route, 'https://localhost'), method), false);
});
async function request(t, fetchImpl, route, options = {}, timeout = 10000) {
    const server = http.createServer(createRemoteMiddleware({fetchImpl, timeout, catalogOrigin: 'http://127.0.0.1:19083'}));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    return fetch(`http://127.0.0.1:${server.address().port}${route}`, options);
}
test('live JSON forwards queries, strips credentials, disables caching', async t => {
    const res = await request(t, async (url, options) => {
        assert.equal(url, 'https://geo.so.ch/map/themes.json?lang=de-CH');
        assert.equal(options.headers.Cookie, undefined);
        return Response.json({themes: {items: [{sublayers: []}]}});
    }, '/map/themes.json?lang=de-CH', {headers: {Cookie: 'secret'}});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), {themes: {items: [{sublayers: []}]}});
});
for (const failure of [async () => new Response('bad', {status: 503}), async () => new Response('not json'), async () => Response.json({wrong: true}), async (_, {signal}) => { await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))); }]) {
    test('upstream failure yields 502 without fallback', async t => {
        const res = await request(t, failure, '/map/config.json', {}, 20);
        assert.equal(res.status, 502);
        assert.match(await res.text(), /Live-Anbindung fehlgeschlagen/);
    });
}
test('blocked request never contacts production', async t => {
    const res = await request(t, () => { throw new Error('must not run'); }, '/api/data/v1/x', {method: 'POST'});
    assert.equal(res.status, 403);
});
test('nested editing and login menu entries are removed', () => {
    const config = adaptConfig({plugins: {desktop: [{name: 'TopBar', cfg: {menuItems: [{key: 'Tools', subitems: [{key: 'Editing'}, {key: 'Measure'}]}, {key: 'LoginMySoCh'}]}}]}});
    assert.deepEqual(config.plugins.desktop[0].cfg.menuItems.filter(item => item.key !== 'Kartenkatalog'), [{key: 'Tools', subitems: [{key: 'Measure'}]}]);
});
test('root redirect keeps query and targets local app', async t => {
    const res = await request(t, () => { throw new Error('must not run'); }, '/?l=example', {redirect: 'manual'});
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/map/?l=example');
});
test('local catalog requests reach only the configured API without cookies', async t => {
    const res = await request(t, async (url, options) => {
        assert.equal(url, 'http://127.0.0.1:19083/api/v1/catalog');
        assert.equal(options.headers.Cookie, undefined);
        return Response.json({themes: []});
    }, '/catalog-api/v1/catalog', {headers: {Cookie: 'secret'}});
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {themes: []});
});
test('catalog proxy denies other routes and writes', async t => {
    for (const [route, method] of [['/catalog-api/v1/catalog', 'POST'], ['/catalog-api/actuator/env', 'GET']]) {
        const res = await request(t, () => { throw new Error('must not forward'); }, route, {method});
        assert.equal(res.status, 403);
    }
});
test('catalog overlay registers menu and plugin once on desktop and mobile', () => {
    const original = {plugins: {desktop: [{name: 'TopBar', cfg: {menuItems: []}}], mobile: [{name: 'TopBar', cfg: {menuItems: []}}]}};
    const config = adaptConfig(adaptConfig(original));
    for (const device of ['desktop', 'mobile']) {
        assert.equal(config.plugins[device].filter(p => p.name === 'Kartenkatalog').length, 1);
        assert.equal(config.plugins[device][0].cfg.menuItems.filter(i => i.key === 'Kartenkatalog').length, 1);
    }
    assert.equal(original.plugins.desktop[0].cfg.menuItems.length, 0);
});
test('unreachable catalog API gives 502 without production fallback', async t => {
    const res = await request(t, async url => {
        assert.equal(url, 'http://127.0.0.1:19083/api/v1/catalog');
        throw new Error('connection refused');
    }, '/catalog-api/v1/catalog');
    assert.equal(res.status, 502);
    assert.match(await res.text(), /connection refused/);
});
