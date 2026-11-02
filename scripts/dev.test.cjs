const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {devConfig, waitForCatalog, checkPort, startFrontend} = require('./dev.cjs');
const xtf = path.resolve(__dirname, '../data/kartenkatalog-harvest-ohne-qml.xtf');
const config = (source = xtf, port = '18082') => ({services: {kartenkatalog: {volumes: [{target: '/catalog/catalog.xtf', source}]}, qwc: {ports: [{target: 8080, published: port}]}}});
test('resolved Compose configuration supplies dev port and validates XTF before mutations', () => {
    assert.deepEqual(devConfig(config()), {port: 18082});
    assert.throws(() => devConfig(config('/missing.xtf')));
    assert.throws(() => devConfig(config(xtf, '0')), /QWC_PORT/);
});
test('backend readiness retries non-UP JSON, HTTP errors and connection failures', async () => {
    const responses = [new Error('refused'), new Response('', {status: 503}), Response.json({status: 'DOWN'}), Response.json({status: 'UP'})];
    await waitForCatalog('http://127.0.0.1:19083', {interval: 1, timeout: 1000, fetchImpl: async url => {
        assert.equal(url, 'http://127.0.0.1:19083/q/health/ready');
        const result = responses.shift(); if (result instanceof Error) throw result; return result;
    }});
    assert.equal(responses.length, 0);
});
test('readiness timeout provides diagnostic command', async () => {
    await assert.rejects(waitForCatalog('http://localhost', {timeout: 10, interval: 1, fetchImpl: async () => Response.json({status: 'DOWN'})}), /docker compose logs kartenkatalog/);
});
test('occupied ports fail without stopping their owner', async t => {
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    await assert.rejects(checkPort(server.address().port), /occupied/);
    assert.ok(server.listening);
});
test('frontend failures propagate and receive configured ports', async () => {
    const code = await startFrontend(19082, 'http://127.0.0.1:19083', {command: process.execPath, args: ['-e', 'process.exit(process.env.QWC_PORT === "19082" && process.env.CATALOG_API_ORIGIN === "http://127.0.0.1:19083" ? 7 : 8)']});
    assert.equal(code, 7);
});
test('SIGINT shuts down frontend process group including its child', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qwc-dev-signal-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const pidFile = path.join(dir, 'pid');
    const childScript = `const child = require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)']); require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid)); setInterval(()=>{},1000);`;
    const launcher = spawn(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, 'dev.cjs'))}).startFrontend(8082,'http://localhost',{command:process.execPath,args:['-e',${JSON.stringify(childScript)}]}).then(code=>process.exitCode=code);`], {stdio: 'ignore'});
    t.after(() => { try { launcher.kill('SIGKILL'); } catch {} });
    const exited = new Promise(resolve => launcher.once('exit', resolve));
    for (let i = 0; !fs.existsSync(pidFile) && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(fs.existsSync(pidFile));
    const pid = Number(fs.readFileSync(pidFile));
    launcher.kill('SIGINT');
    assert.equal(await exited, 0);
    for (let i = 0; i < 100; i++) {
        try { process.kill(pid, 0); } catch (error) { assert.equal(error.code, 'ESRCH'); return; }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('frontend grandchild still running');
});
test('dev launcher validates, stops project QWC, starts only backend and forwards resolved ports', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qwc-dev-launch-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const http = require('node:http');
    const backend = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"status":"UP"}'); });
    await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
    t.after(() => backend.close());
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const devPort = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const log = path.join(dir, 'commands');
    fs.writeFileSync(path.join(dir, 'docker'), `#!/usr/bin/env node
const fs=require('node:fs'); const args=process.argv.slice(2); fs.appendFileSync(process.env.DEV_TEST_LOG,args.join(' ')+'\\n');
if(args.includes('--format')) console.log(process.env.DEV_TEST_CONFIG);
if(args.includes('--environment')) console.log('CATALOG_XTF_PATH='+process.env.DEV_TEST_XTF);
if(args.includes('port')) console.log('127.0.0.1:'+process.env.DEV_TEST_BACKEND_PORT);
`, {mode: 0o755});
    fs.writeFileSync(path.join(dir, 'npm'), `#!/usr/bin/env node
require('node:fs').appendFileSync(process.env.DEV_TEST_LOG,'frontend '+process.env.QWC_PORT+' '+process.env.CATALOG_API_ORIGIN+'\\n');
`, {mode: 0o755});
    async function launch(source = xtf) {
        const child = spawn(process.execPath, [path.join(__dirname, 'dev.cjs')], {cwd: dir, env: {...process.env, PATH: dir + path.delimiter + process.env.PATH, DEV_TEST_LOG: log, DEV_TEST_CONFIG: JSON.stringify(config(source, String(devPort))), DEV_TEST_XTF: source, DEV_TEST_BACKEND_PORT: String(backend.address().port)}, stdio: 'ignore'});
        return new Promise(resolve => child.once('exit', resolve));
    }
    assert.equal(await launch(), 0);
    const calls = fs.readFileSync(log, 'utf8').split('\n');
    const index = text => calls.findIndex(call => call.includes(text));
    assert.ok(index('config --format json') < index('stop qwc'));
    assert.ok(index('stop qwc') < index('pull kartenkatalog'));
    assert.ok(index('up -d --no-deps') < index('frontend ' + devPort));
    assert.match(calls[index('frontend ' + devPort)], new RegExp('http://127.0.0.1:' + backend.address().port));
    assert.ok(!calls.some(call => /build qwc|up.* qwc|pull$/.test(call)));
    fs.writeFileSync(log, '');
    assert.equal(await launch('/missing.xtf'), 1);
    assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /stop|pull|up -d|frontend/);
});
