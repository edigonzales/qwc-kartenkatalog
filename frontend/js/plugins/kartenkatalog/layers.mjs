import {catalogError} from './errors.mjs';

export function leafNames(nodes) {
    return [...new Set(nodes.flatMap(node => node.sublayers?.length ? leafNames(node.sublayers) : node.name ? [node.name] : []))];
}

export function findDefinition(nodes, name) {
    for (const node of nodes || []) {
        if (node.name === name) return node;
        const found = findDefinition(node.sublayers, name);
        if (found) return found;
    }
    return null;
}

function serviceUrl(value, baseUrl) {
    try { return new URL(value, baseUrl).href; } catch { return null; }
}

export function findMatches(layers, names, theme, baseUrl) {
    const wanted = new Set(names);
    const matches = [];
    for (const layer of layers || []) {
        if (layer.type !== 'wms' || ![2, 3].includes(layer.role) || serviceUrl(layer.url, baseUrl) !== serviceUrl(theme?.url, baseUrl)) continue;
        const walk = (node, path, parentsVisible) => {
            const visible = parentsVisible && node.visibility !== false;
            if (wanted.has(node.name)) matches.push({layerId: layer.id, path, name: node.name, visible});
            (node.sublayers || []).forEach((child, index) => walk(child, [...path, index], visible));
        };
        walk(layer, [], true);
    }
    return matches;
}

export function missingDefinitions(nodes, present) {
    return nodes.flatMap(node => {
        if (!node.sublayers?.length) return present.has(node.name) ? [] : [{...structuredClone(node), visibility: true}];
        const sublayers = missingDefinitions(node.sublayers, present);
        return sublayers.length ? [{...structuredClone(node), visibility: true, sublayers}] : [];
    });
}

/** QWC adapters are injected so this state/duplicate logic can be tested independently. */
export function createLayerController({resolve, createLayer, addLayer, changeLayerProperty, baseUrl}) {
    const cache = new WeakMap();
    const pending = new WeakMap();
    const definitions = (entry, theme) => {
        const known = findDefinition(theme?.sublayers, entry.qwcLayerName);
        return known ? [known] : theme && cache.get(theme)?.get(entry.qwcLayerName);
    };
    const matchesFor = (entry, state) => {
        const theme = state.theme.current;
        const nodes = definitions(entry, theme);
        const names = nodes ? leafNames(nodes) : [entry.qwcLayerName];
        return {names, matches: findMatches(state.layers.flat, names, theme, baseUrl)};
    };
    const status = (entry, state) => {
        const {names, matches} = matchesFor(entry, state);
        const loaded = new Set(matches.map(m => m.name));
        if (!loaded.size) return 'missing';
        if (names.some(name => !loaded.has(name))) return 'partial';
        return names.every(name => matches.some(m => m.name === name && m.visible)) ? 'visible' : 'hidden';
    };
    const add = (entry, dispatch, getState) => {
        const theme = getState().theme.current;
        if (!theme) return Promise.reject(catalogError('mapNotReady'));
        if (!pending.has(theme)) pending.set(theme, new Map());
        const requests = pending.get(theme);
        if (requests.has(entry.qwcLayerName)) return requests.get(entry.qwcLayerName);
        const operation = (async() => {
            let nodes = definitions(entry, theme);
            if (!nodes) {
                nodes = await resolve(entry.qwcLayerName, theme);
                if (!nodes?.length || !leafNames(nodes).length) throw catalogError('layerUnavailable');
                if (!cache.has(theme)) cache.set(theme, new Map());
                cache.get(theme).set(entry.qwcLayerName, structuredClone(nodes));
            }
            const state = getState(); // Recheck after async resolution, including concurrent additions.
            if (state.theme.current !== theme) throw catalogError('themeChanged');
            const {matches} = matchesFor(entry, state);
            const present = new Set(matches.map(m => m.name));
            for (const match of matches) {
                if (!match.visible) dispatch(changeLayerProperty(match.layerId, 'visibility', true, match.path, 'both'));
            }
            const missing = missingDefinitions(nodes, present);
            if (missing.length) dispatch(addLayer(createLayer(theme, state.theme.themes, missing)));
        })();
        requests.set(entry.qwcLayerName, operation);
        operation.finally(() => requests.delete(entry.qwcLayerName)).catch(() => {});
        return operation;
    };
    return {add, status};
}
