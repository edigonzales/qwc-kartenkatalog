const fs = require('node:fs');
const path = require('node:path');
const ORIGIN = 'https://geo.so.ch';
const disabled = new Set(['NewsPopup', 'Login', 'Logout', 'LoginMySoCh', 'Authentication', 'Autologin', 'LoginUser', 'Editing', 'CCCInterface', 'Print', 'LegendPrint', 'LandRegisterExtract', 'PlotInfoTool', 'Share', 'Bookmark', 'HeightProfile', 'MapInfoTooltip']);

function adaptConfig(input) {
    const config = structuredClone(input);
    config.plugins ||= {};
    config.username = null;
    config.user_infos = {};
    for (const key of ['authServiceUrl', 'editServiceUrl', 'cccConfigService', 'permalinkServiceUrl']) delete config[key];
    const filterMenu = items => items.filter(item => !disabled.has(item.key || item.task || item.name)).map(item => ({...item, ...(item.subitems ? {subitems: filterMenu(item.subitems)} : {})}));
    for (const entries of Object.values(config.plugins || {})) {
        if (!Array.isArray(entries)) continue;
        for (const plugin of entries) {
            if (plugin.cfg?.menuItems) plugin.cfg.menuItems = filterMenu(plugin.cfg.menuItems);
        }
    }
    for (const key of Object.keys(config.plugins || {})) {
        if (Array.isArray(config.plugins[key])) config.plugins[key] = config.plugins[key].filter(plugin => !disabled.has(plugin.name));
    }
    for (const device of ['desktop', 'mobile']) {
        const plugins = config.plugins[device] ||= [];
        if (!plugins.some(plugin => plugin.name === 'Kartenkatalog')) {
            plugins.push({name: 'Kartenkatalog', cfg: {catalogUrl: '/catalog-api/v1/catalog', width: '32em'}});
        }
        const topbar = plugins.find(plugin => plugin.name === 'TopBar');
        if (topbar) {
            topbar.cfg ||= {};
            topbar.cfg.menuItems ||= [];
            if (!topbar.cfg.menuItems.some(item => item.key === 'Kartenkatalog')) {
                topbar.cfg.menuItems.unshift({key: 'Kartenkatalog', icon: 'catalog'});
            }
        }
    }
    config.startupTask = {key: 'Kartenkatalog'};
    return config;
}
function rewriteUrls(value) {
    if (Array.isArray(value)) return value.map(rewriteUrls);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteUrls(v)]));
    if (typeof value === 'string' && value.startsWith(ORIGIN + '/api/wmts/')) return value.slice(ORIGIN.length);
    return value;
}
function allowed(url, method) {
    if (!['GET', 'HEAD'].includes(method)) return false;
    if (url.pathname === '/ows/somap' || url.pathname === '/wms') {
        return ['getmap', 'getfeatureinfo', 'getlegendgraphic', 'getcapabilities'].includes((url.searchParams.get('REQUEST') || url.searchParams.get('request') || '').toLowerCase());
    }
    return [/^\/api\/wmts\//, /^\/api\/search\/v2\//, /^\/api\/dataproduct\/v1\/weblayers$/, /^\/api\/data\/v1\//, /^\/api\/v1\/(featureinfo|legend)\/somap$/].some(pattern => pattern.test(url.pathname));
}
function createRemoteMiddleware({fetchImpl = fetch, timeout = 10000, catalogOrigin = process.env.CATALOG_API_ORIGIN || 'http://127.0.0.1:8083'} = {}) {
    return async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') { res.writeHead(302, {Location: '/map/' + url.search}); return res.end(); }
        const catalogRequest = url.pathname.startsWith('/catalog-api/');
        const catalogAllowed = url.pathname === '/catalog-api/v1/catalog';
        const config = url.pathname === '/map/config.json';
        const themes = url.pathname === '/map/themes.json';
        const image = /^\/map\/(img|assets\/img)\//.test(url.pathname);
        if (image && fs.existsSync(path.join(__dirname, '../static', url.pathname.slice('/map/'.length)))) return next();
        const service = /^\/(api|ows|wms|auth|mysochauth|elevation)(\/|$)/.test(url.pathname) || url.pathname === '/map/editConfig.json';
        if (!(catalogRequest || config || themes || image || service)) return next();
        if (!['GET', 'HEAD'].includes(req.method) || (catalogRequest && !catalogAllowed) || (service && !allowed(url, req.method))) {
            res.writeHead(403, {'Content-Type': 'text/plain; charset=utf-8'}); return res.end('Im anonymen Dev-Modus ist dieser Zugriff nicht freigegeben.');
        }
        try {
            const target = catalogRequest ? catalogOrigin.replace(/\/$/, '') + '/api' + url.pathname.slice('/catalog-api'.length) + url.search : ORIGIN + url.pathname + url.search;
            const upstream = await fetchImpl(target, {signal: AbortSignal.timeout(timeout), redirect: 'error', headers: {Accept: req.headers.accept || '*/*'}});
            if (!upstream.ok) throw new Error(`Live-System antwortet mit HTTP ${upstream.status}`);
            let body;
            if (catalogRequest || config || themes) {
                const json = await upstream.json();
                if (!json || typeof json !== 'object' || Array.isArray(json) || (catalogRequest ? !Array.isArray(json.themes) : config ? !json.plugins : !json.themes)) throw new Error('Ungültige Konfiguration vom Live-System');
                body = Buffer.from(JSON.stringify(rewriteUrls(config ? adaptConfig(json) : json)));
            } else body = Buffer.from(await upstream.arrayBuffer());
            res.writeHead(200, {'Content-Type': catalogRequest || config || themes ? 'application/json' : upstream.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store'});
            res.end(req.method === 'HEAD' ? undefined : body);
        } catch (error) {
            res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'});
            res.end(`Live-Anbindung fehlgeschlagen (${url.pathname}): ${error.message}`);
        }
    };
}
module.exports = {adaptConfig, rewriteUrls, allowed, createRemoteMiddleware};
