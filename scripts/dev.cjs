#!/usr/bin/env node
const {execFileSync, spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {createRequire} = require('node:module');
const {setTimeout: delay} = require('node:timers/promises');

const repoDir = path.resolve(__dirname, '..');
const composeArgs = ['compose', '--project-directory', repoDir, '-f', path.join(repoDir, 'compose.yaml')];
function compose(...args) {
    return execFileSync('docker', [...composeArgs, ...args], {cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']}).trim();
}
function devConfig(config) {
    const source = config.services.kartenkatalog.volumes.find(volume => volume.target === '/catalog/catalog.xtf')?.source;
    if (!source || !fs.statSync(source).isFile()) throw new Error(`XTF file missing or unreadable: ${source}`);
    fs.accessSync(source, fs.constants.R_OK);
    const port = Number(config.services.qwc.ports.find(port => Number(port.target) === 8080)?.published);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('QWC_PORT must be a port between 1 and 65535');
    return {port};
}
async function waitForCatalog(origin, {timeout = 180000, interval = 1000, fetchImpl = fetch} = {}) {
    const deadline = Date.now() + timeout;
    let reason = 'not ready';
    while (Date.now() < deadline) {
        try {
            const response = await fetchImpl(origin + '/q/health/ready', {signal: AbortSignal.timeout(Math.max(1, Math.min(3000, deadline - Date.now()))), redirect: 'error'});
            if (response.ok && (await response.json()).status === 'UP') return;
            reason = `readiness HTTP ${response.status}`;
        } catch (error) { reason = error.message; }
        await delay(Math.min(interval, Math.max(0, deadline - Date.now())));
    }
    throw new Error(`Backend not ready after ${timeout / 1000}s (${reason}). Check: docker compose logs kartenkatalog`);
}
async function checkPort(port) {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once('error', () => reject(new Error(`Port ${port} is occupied. Stop its process or set QWC_PORT to another port.`)));
        server.listen(port, '127.0.0.1', resolve);
    });
    await new Promise(resolve => server.close(resolve));
}
function startFrontend(port, origin, {command = 'npm', args = ['--prefix', 'frontend', 'run', 'start:remote']} = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {cwd: repoDir, env: {...process.env, QWC_PORT: String(port), CATALOG_API_ORIGIN: origin}, stdio: 'inherit', detached: true});
        let interrupted = false;
        const stop = signal => {
            interrupted = true;
            try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        };
        const onInt = () => stop('SIGINT');
        const onTerm = () => stop('SIGTERM');
        process.on('SIGINT', onInt);
        process.on('SIGTERM', onTerm);
        const cleanup = () => {
            process.removeListener('SIGINT', onInt);
            process.removeListener('SIGTERM', onTerm);
        };
        child.once('error', error => { cleanup(); reject(error); });
        child.once('exit', code => { cleanup(); resolve(interrupted ? 0 : (code ?? 1)); });
    });
}
async function main() {
    if (process.argv.includes('--help')) {
        console.log('Usage: npm run dev\nStart backend in Docker and local QWC with hot reload. Ctrl+C stops QWC; backend stays running.');
        return 0;
    }
    if (process.argv.length > 2) throw new Error('Unknown option. Use npm run dev -- --help');
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 13)) throw new Error('Node 22.13 or newer required. Run nvm use.');
    const frontendRequire = createRequire(path.join(repoDir, 'frontend/package.json'));
    try {
        for (const name of ['webpack', 'webpack-cli', 'webpack-dev-server', 'qwc2-lts/package.json', 'react', 'style-loader', 'css-loader']) frontendRequire.resolve(name);
    } catch { throw new Error('Frontend dependencies missing. Run npm run setup first.'); }
    execFileSync('docker', ['info'], {stdio: 'ignore'});
    const {port} = devConfig(JSON.parse(compose('config', '--format', 'json')));
    // Only the QWC container belonging to this Compose project is stopped.
    compose('stop', 'qwc');
    await checkPort(port);
    execFileSync('bash', [path.join(repoDir, 'scripts/up.sh'), '--catalog-only'], {cwd: repoDir, stdio: 'inherit'});
    const address = compose('port', 'kartenkatalog', '8080');
    if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error(`Unexpected backend binding: ${address}`);
    const origin = 'http://' + address;
    await waitForCatalog(origin);
    console.log(`\nQWC dev: http://127.0.0.1:${port}/map/\nBackend: ${origin}\nCtrl+C stops QWC; backend stays running.`);
    return startFrontend(port, origin);
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => { console.error(`Dev start failed: ${error.message}`); process.exitCode = 1; });
module.exports = {devConfig, waitForCatalog, checkPort, startFrontend};
