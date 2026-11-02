import {addThemeSublayer, changeLayerProperty} from 'qwc2/actions/layers';

import {themeLayerRestorer} from '../../themeLayerRestorer';
import {createLayerController} from './layers.mjs';

export function createQwcLayerController() {
    return createLayerController({
        baseUrl: window.location.href,
        // Same action as Solothurn's search: QWC 2026 resolves externalLayerMap
        // only on LayerRole.THEME. mergeSubLayers extracts external services.
        addLayer: addThemeSublayer,
        changeLayerProperty,
        resolve: (name, theme) => new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Der Kartendienst antwortet nicht. Bitte erneut versuchen.')), 15000);
            themeLayerRestorer([name], theme, (nodes, mapping) => {
                clearTimeout(timeout);
                if (mapping === null) {
                    reject(new Error('Die Layerdefinitionen konnten nicht geladen werden. Bitte erneut versuchen.'));
                } else {
                    resolve(nodes);
                }
            });
        }),
        // Inherit WMS/CRS settings from the current theme. Do not fetch editing
        // metadata for this read-only catalog action.
        createLayer: (theme, themes, nodes) => ({sublayers: nodes})
    });
}
