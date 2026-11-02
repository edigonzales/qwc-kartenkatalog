const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createServer} = require('./server.cjs');

async function fixture(t, fetchImpl = async () => { throw new Error('unexpected upstream'); }) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qwc-server-'));
    const root = path.join(dir, 'prod');
    await fs.mkdir(path.join(root, 'assets/img'), {recursive: true});
    for (const [name, body] of Object.entries({'index.html': '<html>local</html>', 'app.js': 'local()', 'assets/img/logo.svg': '<svg/>', '.secret': 'secret'})) await fs.writeFile(path.join(root, name), body);
    await fs.writeFile(path.join(dir, 'outside'), 'secret');
    await fs.symlink(path.join(dir, 'outside'), path.join(root, 'escape'));
    const server = createServer({staticRoot: root, fetchImpl, catalogOrigin: 'http://catalog:8080'});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(dir, {recursive: true}); });
    return async (route, method = 'GET') => new Promise((resolve, reject) => {
        const req = http.request({hostname: '127.0.0.1', port: server.address().port, path: route, method}, res => {
            let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body}));
        });
        req.on('error', reject); req.end();
    });
}
test('serves local assets, MIME, HEAD, redirects and real 404s', async t => {
    const request = await fixture(t);
    assert.equal((await request('/?l=test')).headers.location, '/map/?l=test');
    assert.equal((await request('/map?lang=de')).headers.location, '/map/?lang=de');
    const html = await request('/map/');
    assert.equal(html.status, 200); assert.match(html.headers['content-type'], /text\/html/);
    const js = await request('/map/app.js'); assert.match(js.headers['content-type'], /javascript/);
    assert.equal((await request('/map/app.js', 'HEAD')).body, '');
    const image = await request('/map/assets/img/logo.svg'); assert.equal(image.body, '<svg/>');
    assert.equal(image.headers['content-type'], 'image/svg+xml');
    assert.equal((await request('/map/missing.js')).status, 404);
    assert.equal((await request('/outside')).status, 404);
});
test('denies traversal, dotfiles, symlinks, malformed paths and writes before upstream', async t => {
    const request = await fixture(t);
    for (const route of ['/map/../outside', '/map/%2e%2e/outside', '/map/assets%2f..%2f..%2foutside', '/map/%5coutside', '/map/%00', '/map/%ZZ']) assert.equal((await request(route)).status, 400, route);
    assert.equal((await request('/map/.secret')).status, 404);
    assert.equal((await request('/map/escape')).status, 403);
    assert.equal((await request('/map/app.js', 'POST')).status, 403);
    assert.equal((await request('/auth/login')).status, 403);
    assert.equal((await request('/catalog-api/v1/catalog', 'POST')).status, 403);
});
test('shares live adapter and catalog proxy with development mode', async t => {
    const request = await fixture(t, async url => {
        if (url === 'http://catalog:8080/api/v1/catalog') return Response.json({themes: []});
        assert.equal(url, 'https://geo.so.ch/map/config.json?lang=de-CH');
        return Response.json({plugins: {desktop: [{name: 'Editing'}]}});
    });
    const config = JSON.parse((await request('/map/config.json?lang=de-CH')).body);
    assert.equal(config.plugins.desktop[0].name, 'Kartenkatalog');
    assert.equal((await request('/catalog-api/v1/catalog')).status, 200);
});
test('readiness depends on real backend health, assets survive backend outage', async t => {
    let up = false;
    const request = await fixture(t, async url => {
        assert.equal(url, 'http://catalog:8080/q/health/ready');
        return Response.json({status: up ? 'UP' : 'DOWN'});
    });
    assert.equal((await request('/healthz')).status, 503);
    assert.equal((await request('/map/')).status, 200);
    up = true; assert.equal((await request('/healthz')).status, 200);
});
test('backend connection failures produce 503 health and 502 catalog without fallback', async t => {
    const request = await fixture(t);
    assert.equal((await request('/healthz')).status, 503);
    assert.equal((await request('/catalog-api/v1/catalog')).status, 502);
});
