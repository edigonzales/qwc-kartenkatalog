import {catalogError} from './errors.mjs';

export function normalize(value = '') {
    return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('de-CH').replace(/ß/g, 'ss');
}

export function prepareCatalog(data) {
    if (!Array.isArray(data?.themes)) throw catalogError('catalogInvalid');
    const seen = new Set();
    return data.themes.map(({theme, layers}) => {
        if (!theme?.identifier || typeof theme.title !== 'string' || !Array.isArray(layers) || seen.has(theme.identifier)) {
            throw catalogError('themesInvalid');
        }
        seen.add(theme.identifier);
        const ids = new Set();
        const themeText = [theme.title, theme.description, ...(theme.keywords || []), ...(theme.synonyms || [])];
        return {theme, layers: layers.map(layer => {
            if (!layer?.id || typeof layer.title !== 'string' || !layer.qwcLayerName || ids.has(layer.id)) {
                throw catalogError('layersInvalid');
            }
            ids.add(layer.id);
            return {...layer, searchText: normalize([...themeText, layer.id, layer.title, layer.description,
                ...(layer.keywords || []), ...(layer.synonyms || [])].join(' '))};
        })};
    });
}

export function filterCatalog(catalog, query) {
    const words = normalize(query).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return catalog;
    return catalog.map(entry => ({...entry, layers: entry.layers.filter(layer => words.every(word => layer.searchText.includes(word)))}))
        .filter(entry => entry.layers.length);
}

export function safeLink(value) {
    try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
}
