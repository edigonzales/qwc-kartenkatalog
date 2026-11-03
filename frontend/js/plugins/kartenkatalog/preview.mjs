import {leafDefinitions} from './layers.mjs';

export const PREVIEW_ID = 'kartenkatalog-hover-preview';

/** Independent of React and QWC so timer and request races can be tested. */
export function createPreviewController({controller, createLayer, showLayer, removeLayer, isVisible = () => false,
    onGroup = () => {}, schedule = setTimeout, cancel = clearTimeout}) {
    let generation = 0;
    let timer = null;
    let active = null;
    let currentEntry = null;
    const clear = (dispatch, entry) => {
        if (entry && currentEntry?.qwcLayerName !== entry.qwcLayerName) return;
        currentEntry = null;
        generation++;
        if (timer !== null) cancel(timer);
        timer = null;
        if (active) {
            active = null;
            dispatch(removeLayer(PREVIEW_ID));
        }
    };
    const start = (entry, dispatch, getState) => {
        clear(dispatch);
        const theme = getState().theme.current;
        if (!theme || controller.isGroup(entry, theme) || controller.status(entry, getState()) === 'visible') return;
        currentEntry = entry;
        const request = generation;
        timer = schedule(async() => {
            timer = null;
            try {
                const nodes = await controller.resolveDefinitions(entry, theme);
                if (request !== generation || getState().theme.current !== theme) return;
                if (leafDefinitions(nodes).length > 1) {
                    onGroup(entry, theme);
                    return;
                }
                const state = getState();
                if (controller.status(entry, state) === 'visible') return;
                const layer = createLayer(entry, nodes, state);
                if (!layer || isVisible(layer, state)) return;
                active = {entry, theme, layer};
                dispatch(showLayer(layer));
            } catch {
                // Hover must never interrupt the normal catalog actions.
                if (request === generation) clear(dispatch);
            }
        }, 150);
    };
    const reconcile = (dispatch, getState) => {
        if (!active) return;
        const state = getState();
        if (state.theme.current !== active.theme || controller.status(active.entry, state) === 'visible' || isVisible(active.layer, state)) {
            clear(dispatch);
        }
    };
    return {start, clear, reconcile};
}
