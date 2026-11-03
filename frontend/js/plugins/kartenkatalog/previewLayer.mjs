import {leafDefinitions, leafNames} from './layers.mjs';
import {PREVIEW_ID} from './preview.mjs';

/** Build only from cloned definitions; never borrow IDs or mutate the map. */
export function buildPreviewLayer(entry, definitions, state, {createThemeLayer, completeExternalLayer, role}) {
    const nodes = structuredClone(definitions);
    if (leafDefinitions(nodes).length !== 1) return null;
    let leaf;
    const enable = node => {
        node.visibility = true;
        node.queryable = false;
        delete node.tristate;
        if (node.sublayers?.length) node.sublayers.forEach(enable);
        else leaf = node;
    };
    nodes.forEach(enable);
    const theme = state.theme.current;
    const base = createThemeLayer({...theme, editConfig: undefined, editConfigUrl: undefined, translationsUrl: undefined},
        state.theme.themes, role, nodes);
    const external = leaf.externalLayer || base.externalLayerMap?.[leaf.name];
    let layer = base;
    if (external) {
        layer = structuredClone(external);
        completeExternalLayer(layer, leaf, theme.mapCrs);
        layer.opacity = leaf.opacity ?? layer.opacity ?? 255;
        if (leaf.style) layer.style = leaf.style;
    }
    return {...layer, id: PREVIEW_ID, srcid: PREVIEW_ID, title: entry.title, role, visibility: true,
        minScale: leaf.minScale ?? layer.minScale, maxScale: leaf.maxScale ?? layer.maxScale,
        layertreehidden: true, queryable: false, queryLayers: [], omitFromQueryLayers: true,
        editConfig: undefined, editConfigUrl: undefined, translationsUrl: undefined};
}

/** Also recognize permanently loaded external WMS/WMTS layers. */
export function previewLayerVisible(candidate, state, baseUrl) {
    const url = value => { try { return new URL(value, baseUrl).href; } catch { return null; } };
    const wanted = candidate.type === 'wms' ? (candidate.params?.LAYERS?.split(',') || leafNames(candidate.sublayers || [])) : [candidate.name];
    const visible = new Set();
    for (const layer of state.layers.flat) {
        if (![2, 3].includes(layer.role) || layer.type !== candidate.type || url(layer.url) !== url(candidate.url)) continue;
        const walk = (node, parentVisible) => {
            if (!parentVisible || node.visibility === false) return;
            if (node.sublayers?.length) node.sublayers.forEach(child => walk(child, true));
            else (node.params?.LAYERS?.split(',') || [node.name]).forEach(name => visible.add(name));
        };
        walk(layer, true);
    }
    return wanted.length > 0 && wanted.every(name => visible.has(name));
}
