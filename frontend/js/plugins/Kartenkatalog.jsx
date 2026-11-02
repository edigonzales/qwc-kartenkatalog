import React, {useEffect, useMemo, useRef, useState} from 'react';
import {connect} from 'react-redux';

import axios from 'axios';
import DOMPurify from 'dompurify';
import PropTypes from 'prop-types';
import Icon from 'qwc2/components/Icon';
import SideBar from 'qwc2/components/SideBar';
import InputContainer from 'qwc2/components/widgets/InputContainer';
import Spinner from 'qwc2/components/widgets/Spinner';

import {filterCatalog, prepareCatalog, safeLink} from './kartenkatalog/catalog.mjs';
import {createQwcLayerController} from './kartenkatalog/qwc';

import './style/Kartenkatalog.css';

const typeLabel = type => ({layergroup: 'Layergruppe', extwms: 'Externer WMS', facadelayer: 'Kartenebene', datasetview: 'Kartenebene'}[type] || 'Kartenebene');
const statusLabel = status => ({visible: 'In Karte', hidden: 'Aktivieren', partial: 'Vervollständigen', missing: 'Hinzufügen'}[status]);

function Description({item}) {
    const html = useMemo(() => DOMPurify.sanitize(item.descriptionHtml || ''), [item.descriptionHtml]);
    return html ? <div className="kartenkatalog-description" dangerouslySetInnerHTML={{__html: html}} /> :
        item.description ? <p className="kartenkatalog-description">{item.description}</p> : <p>Keine Beschreibung vorhanden.</p>;
}
Description.propTypes = {item: PropTypes.object.isRequired};

function Terms({title, values}) {
    return values?.length ? <div className="kartenkatalog-terms"><h4>{title}</h4><ul>{values.map(value => <li key={value}>{value}</li>)}</ul></div> : null;
}
Terms.propTypes = {title: PropTypes.string.isRequired, values: PropTypes.array};

function Kartenkatalog({catalogUrl = '/catalog-api/v1/catalog', dispatch, layers, theme, themes, width = '32em'}) {
    const [catalog, setCatalog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [reload, setReload] = useState(0);
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(new Set());
    const [detail, setDetail] = useState(null);
    const [busy, setBusy] = useState(new Set());
    const [errors, setErrors] = useState({});
    const inFlight = useRef(new Set());
    const controller = useMemo(createQwcLayerController, []);
    const state = {layers: {flat: layers}, theme: {current: theme, themes}};

    useEffect(() => {
        const abort = new AbortController();
        setLoading(true);
        setLoadError(null);
        setDetail(null);
        axios.get(catalogUrl, {signal: abort.signal, timeout: 15000}).then(response => {
            setCatalog(prepareCatalog(response.data));
        }).catch(error => {
            if (!abort.signal.aborted) {
                setLoadError(error.response?.status === 502 ?
                    'Der Kartenkatalog ist zurzeit nicht erreichbar. Bitte erneut versuchen.' :
                    error.code === 'ECONNABORTED' ? 'Die Katalog-API antwortet nicht rechtzeitig.' : 'Der Kartenkatalog konnte nicht geladen werden.');
            }
        }).finally(() => {
            if (!abort.signal.aborted) setLoading(false);
        });
        return () => abort.abort();
    }, [catalogUrl, reload]);

    const filtered = useMemo(() => filterCatalog(catalog || [], query), [catalog, query]);
    const count = filtered.reduce((total, entry) => total + entry.layers.length, 0);
    const add = async entry => {
        const name = entry.qwcLayerName;
        if (inFlight.current.has(name)) return;
        inFlight.current.add(name);
        setBusy(previous => new Set(previous).add(name));
        setErrors(previous => ({...previous, [name]: null}));
        try {
            await dispatch((dispatchAction, getState) => controller.add(entry, dispatchAction, getState));
        } catch (error) {
            setErrors(previous => ({...previous, [name]: error.message || 'Die Kartenebene konnte nicht hinzugefügt werden.'}));
        } finally {
            inFlight.current.delete(name);
            setBusy(previous => {
                const next = new Set(previous);
                next.delete(name);
                return next;
            });
        }
    };
    const addButton = entry => {
        const pending = busy.has(entry.qwcLayerName);
        const status = controller.status(entry, state);
        const label = pending ? 'Wird geladen …' : statusLabel(status);
        return (<button aria-label={`${label}: ${entry.title}`} className="button kartenkatalog-add"
            disabled={pending || !theme || status === 'visible'} onClick={() => add(entry)} title={label} type="button">
            {pending ? <Spinner /> : <Icon icon={status === 'visible' ? 'checked' : status === 'hidden' ? 'unchecked' : 'plus'} />}
            <span>{label}</span>
        </button>);
    };
    const errorMessage = entry => errors[entry.qwcLayerName] ?
        <p className="kartenkatalog-error" role="alert">{errors[entry.qwcLayerName]}</p> : null;

    const renderDetail = () => {
        const item = detail.layer || detail.theme;
        const moreInfo = safeLink(detail.theme.furtherInfoUrl);
        return (<div className="kartenkatalog-detail">
            <button className="button" onClick={() => setDetail(null)} type="button"><Icon icon="chevron-left" /> Zurück zur Übersicht</button>
            <h3>{item.title}</h3>
            {detail.layer ? <div className="kartenkatalog-detail-action">{addButton(detail.layer)}{errorMessage(detail.layer)}</div> : null}
            <Description item={item} />
            <dl>
                {detail.layer ? <><dt>Thema</dt><dd>{detail.theme.title}</dd><dt>Kennung</dt><dd><code>{item.qwcLayerName}</code></dd>
                    <dt>Typ</dt><dd>{typeLabel(item.type)}</dd>
                    {typeof item.transparency === 'number' ? <><dt>Vorgesehene Transparenz</dt><dd>{item.transparency} %</dd></> : null}
                    {item.organization ? <><dt>Organisation</dt><dd>{item.organization}</dd></> : null}
                    {item.publicationScope ? <><dt>Verfügbarkeit</dt><dd>{item.publicationScope}</dd></> : null}
                    {typeof item.downloadAvailable === 'boolean' ? <><dt>Download</dt><dd>{item.downloadAvailable ? 'Möglich' : 'Nicht verfügbar'}</dd></> : null}
                </> : <><dt>Kartenebenen</dt><dd>{detail.count}</dd></>}
                {detail.theme.dataOwner ? <><dt>Zuständige Stelle</dt><dd>{detail.theme.dataOwner}</dd></> : null}
            </dl>
            <Terms title="Schlagwörter" values={item.keywords} />
            <Terms title="Synonyme" values={item.synonyms} />
            {moreInfo ? <p><a href={moreInfo} rel="noopener noreferrer" target="_blank">Weitere Informationen zum Thema <Icon icon="info" /></a></p> : null}
        </div>);
    };
    const renderList = () => (<>
        <div className="kartenkatalog-search">
            <InputContainer>
                <span role="prefix"><Icon icon="search" /></span>
                <input aria-label="Themen und Kartenebenen suchen" onChange={event => setQuery(event.target.value)}
                    placeholder="Themen und Kartenebenen suchen …" role="input" type="search" value={query} />
                {query ? <button aria-label="Suche löschen" className="kartenkatalog-icon-button" onClick={() => setQuery('')} role="suffix" type="button"><Icon icon="clear" /></button> : null}
            </InputContainer>
            <div aria-live="polite" className="kartenkatalog-count">{count} {count === 1 ? 'Kartenebene' : 'Kartenebenen'} in {filtered.length} {filtered.length === 1 ? 'Thema' : 'Themen'}</div>
        </div>
        {!filtered.length ? <p className="kartenkatalog-empty">Keine passenden Themen oder Kartenebenen gefunden.</p> : null}
        <div className="kartenkatalog-themes">
            {filtered.map(entry => (<details key={entry.theme.identifier} onToggle={event => {
                if (query.trim()) return;
                const open = event.currentTarget.open;
                setExpanded(previous => {
                    if (previous.has(entry.theme.identifier) === open) return previous;
                    const next = new Set(previous);
                    if (open) next.add(entry.theme.identifier); else next.delete(entry.theme.identifier);
                    return next;
                });
            }} open={Boolean(query.trim()) || expanded.has(entry.theme.identifier)}>
                <summary>
                    <Icon icon={query.trim() || expanded.has(entry.theme.identifier) ? 'chevron-down' : 'chevron-right'} />
                    <span className="kartenkatalog-theme-title">{entry.theme.title}</span>
                    <span className="kartenkatalog-badge">{entry.layers.length}</span>
                    {entry.theme.description ? <span className="kartenkatalog-theme-description">{entry.theme.description}</span> : null}
                </summary>
                {query.trim() || expanded.has(entry.theme.identifier) ? (<div className="kartenkatalog-theme-content">
                    <button className="kartenkatalog-text-button" onClick={() => setDetail({theme: entry.theme, count: (catalog.find(e => e.theme.identifier === entry.theme.identifier)?.layers.length || 0)})} type="button">
                        <Icon icon="info" /> Themeninformationen
                    </button>
                    {entry.layers.map(layer => (<div className="kartenkatalog-layer" key={layer.id}>
                        <button className="kartenkatalog-layer-title kartenkatalog-text-button" onClick={() => setDetail({theme: entry.theme, layer})} type="button">{layer.title}</button>
                        <button aria-label={`Metadaten: ${layer.title}`} className="kartenkatalog-icon-button" onClick={() => setDetail({theme: entry.theme, layer})} title="Metadaten anzeigen" type="button"><Icon icon="info" /></button>
                        {addButton(layer)}
                        {layer.description ? <p className="kartenkatalog-layer-description">{layer.description}</p> : null}
                        {errorMessage(layer)}
                    </div>))}
                </div>) : null}
            </details>))}
        </div>
    </>);
    return (<SideBar icon="catalog" id="Kartenkatalog" minWidth="20em" side="right" title="Kartenkatalog" width={width}>
        <div className="kartenkatalog-body" role="body">
            {loading ? <div aria-live="polite" className="kartenkatalog-loading"><Spinner /> Kartenkatalog wird geladen …</div> :
                loadError ? <div className="kartenkatalog-empty"><p role="alert">{loadError}</p><button className="button" onClick={() => setReload(value => value + 1)} type="button"><Icon icon="refresh" /> Erneut laden</button></div> :
                    detail ? renderDetail() : renderList()}
        </div>
    </SideBar>);
}

Kartenkatalog.propTypes = {
    catalogUrl: PropTypes.string,
    dispatch: PropTypes.func.isRequired,
    layers: PropTypes.array.isRequired,
    theme: PropTypes.object,
    themes: PropTypes.object,
    width: PropTypes.string
};
export default connect(state => ({layers: state.layers.flat, theme: state.theme.current, themes: state.theme.themes}))(Kartenkatalog);
