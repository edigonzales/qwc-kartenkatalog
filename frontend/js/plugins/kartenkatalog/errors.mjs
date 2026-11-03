const codes = new Set([
    'catalogInvalid',
    'themesInvalid',
    'layersInvalid',
    'mapNotReady',
    'layerUnavailable',
    'themeChanged',
    'serviceTimeout',
    'definitionsFailed',
    'catalogUnavailable',
    'catalogTimeout',
    'catalogLoadFailed',
    'removeFailed',
    'addFailed'
]);

export function catalogError(code) {
    return Object.assign(new Error(code), {code});
}

export function errorCode(error, fallback) {
    return codes.has(error?.code) ? error.code : fallback;
}
