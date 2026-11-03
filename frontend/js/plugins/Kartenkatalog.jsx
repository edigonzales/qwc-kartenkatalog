import React, {useEffect, useMemo, useRef, useState} from 'react';
import {connect} from 'react-redux';

import axios from 'axios';
import DOMPurify from 'dompurify';
import PropTypes from 'prop-types';
import Icon from 'qwc2/components/Icon';
import SideBar from 'qwc2/components/SideBar';
import InputContainer from 'qwc2/components/widgets/InputContainer';
import Spinner from 'qwc2/components/widgets/Spinner';
import LocaleUtils from 'qwc2/utils/LocaleUtils';

import {filterCatalog, prepareCatalog, safeLink} from './kartenkatalog/catalog.mjs';
import {errorCode} from './kartenkatalog/errors.mjs';
import {createQwcLayerController} from './kartenkatalog/qwc';

import './style/Kartenkatalog.css';

const typeLabel = type => ({
    layergroup: LocaleUtils.tr('kartenkatalog.types.group'),
    extwms: LocaleUtils.tr('kartenkatalog.types.externalWms')
}[type] || LocaleUtils.tr('kartenkatalog.types.layer'));
const statusLabel = status => ({
    visible: LocaleUtils.tr('kartenkatalog.status.visible'),
    hidden: LocaleUtils.tr('kartenkatalog.status.hidden'),
    partial: LocaleUtils.tr('kartenkatalog.status.partial'),
    missing: LocaleUtils.tr('kartenkatalog.status.missing')
}[status]);
const errorLabel = code => ({
    catalogInvalid: LocaleUtils.tr('kartenkatalog.errors.catalogInvalid'),
    themesInvalid: LocaleUtils.tr('kartenkatalog.errors.themesInvalid'),
    layersInvalid: LocaleUtils.tr('kartenkatalog.errors.layersInvalid'),
    catalogUnavailable: LocaleUtils.tr('kartenkatalog.errors.catalogUnavailable'),
    catalogTimeout: LocaleUtils.tr('kartenkatalog.errors.catalogTimeout'),
    catalogLoadFailed: LocaleUtils.tr('kartenkatalog.errors.catalogLoadFailed'),
    mapNotReady: LocaleUtils.tr('kartenkatalog.errors.mapNotReady'),
    layerUnavailable: LocaleUtils.tr('kartenkatalog.errors.layerUnavailable'),
    themeChanged: LocaleUtils.tr('kartenkatalog.errors.themeChanged'),
    serviceTimeout: LocaleUtils.tr('kartenkatalog.errors.serviceTimeout'),
    definitionsFailed: LocaleUtils.tr('kartenkatalog.errors.definitionsFailed')
}[code] || LocaleUtils.tr('kartenkatalog.errors.addFailed'));

function Description({item, preview = false}) {
    const {html, text} = useMemo(() => {
        const source = item.descriptionHtml || (/<\/?[a-z][^>]*>/i.test(item.description || '') ? item.description : '');
        const sanitized = DOMPurify.sanitize(source, {USE_PROFILES: {html: true}});
        const fragment = DOMPurify.sanitize(sanitized, {RETURN_DOM_FRAGMENT: true});
        fragment.querySelectorAll('br, p, div, li, h1, h2, h3, h4, h5, h6, tr').forEach(element => element.after(' '));
        return {html: sanitized, text: source ? fragment.textContent.replace(/\s+/g, ' ').trim() : item.description};
    }, [item.descriptionHtml, item.description]);
    if (preview) return text ? <span className="kartenkatalog-theme-description">{text}</span> : null;
    return html ? <div className="kartenkatalog-description" dangerouslySetInnerHTML={{__html: html}} /> :
        text ? <p className="kartenkatalog-description">{text}</p> : <p>{LocaleUtils.tr('kartenkatalog.noDescription')}</p>;
}
Description.propTypes = {item: PropTypes.object.isRequired, preview: PropTypes.bool};

function Terms({title, values}) {
    return values?.length ? <div className="kartenkatalog-terms"><h4>{title}</h4><ul>{values.map(value => <li key={value}>{value}</li>)}</ul></div> : null;
}
Terms.propTypes = {title: PropTypes.string.isRequired, values: PropTypes.array};

function Kartenkatalog({catalogUrl = '/catalog-api/v1/catalog', dispatch, layers, theme, themes, width = '48em'}) {
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
                    'catalogUnavailable' :
                    error.code === 'ECONNABORTED' ? 'catalogTimeout' : errorCode(error, 'catalogLoadFailed'));
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
            setErrors(previous => ({...previous, [name]: errorCode(error, 'addFailed')}));
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
        const label = pending ? LocaleUtils.tr('kartenkatalog.loadingLayer') : statusLabel(status);
        return (<button aria-label={LocaleUtils.tr('kartenkatalog.layerAction', label, entry.title)} className="button kartenkatalog-add"
            disabled={pending || !theme || status === 'visible'} onClick={() => add(entry)} title={label} type="button">
            {pending ? <Spinner /> : <Icon icon={status === 'visible' ? 'checked' : status === 'hidden' ? 'unchecked' : 'plus'} />}
            <span>{label}</span>
        </button>);
    };
    const errorMessage = entry => errors[entry.qwcLayerName] ?
        <p className="kartenkatalog-error" role="alert">{errorLabel(errors[entry.qwcLayerName])}</p> : null;

    const renderDetail = () => {
        const item = detail.layer || detail.theme;
        const moreInfo = safeLink(detail.theme.furtherInfoUrl);
        return (<div className="kartenkatalog-detail">
            <button className="button" onClick={() => setDetail(null)} type="button"><Icon icon="chevron-left" /><span>{LocaleUtils.tr('kartenkatalog.back')}</span></button>
            <h3>{item.title}</h3>
            {detail.layer ? <div className="kartenkatalog-detail-action">{addButton(detail.layer)}{errorMessage(detail.layer)}</div> : null}
            <Description item={item} />
            <dl>
                {detail.layer ? <><dt>{LocaleUtils.tr('kartenkatalog.fields.theme')}</dt><dd>{detail.theme.title}</dd><dt>{LocaleUtils.tr('kartenkatalog.fields.identifier')}</dt><dd><code>{item.qwcLayerName}</code></dd>
                    <dt>{LocaleUtils.tr('kartenkatalog.fields.type')}</dt><dd>{typeLabel(item.type)}</dd>
                    {typeof item.transparency === 'number' ? <><dt>{LocaleUtils.tr('kartenkatalog.fields.transparency')}</dt><dd>{item.transparency} %</dd></> : null}
                    {item.organization ? <><dt>{LocaleUtils.tr('kartenkatalog.fields.organization')}</dt><dd>{item.organization}</dd></> : null}
                    {item.publicationScope ? <><dt>{LocaleUtils.tr('kartenkatalog.fields.availability')}</dt><dd>{item.publicationScope}</dd></> : null}
                    {typeof item.downloadAvailable === 'boolean' ? <><dt>{LocaleUtils.tr('kartenkatalog.fields.download')}</dt><dd>{item.downloadAvailable ? LocaleUtils.tr('kartenkatalog.downloadAvailable') : LocaleUtils.tr('kartenkatalog.downloadUnavailable')}</dd></> : null}
                </> : <><dt>{LocaleUtils.tr('kartenkatalog.fields.layers')}</dt><dd>{detail.count}</dd></>}
                {detail.theme.dataOwner ? <><dt>{LocaleUtils.tr('kartenkatalog.fields.dataOwner')}</dt><dd>{detail.theme.dataOwner}</dd></> : null}
            </dl>
            <Terms title={LocaleUtils.tr('kartenkatalog.keywords')} values={item.keywords} />
            <Terms title={LocaleUtils.tr('kartenkatalog.synonyms')} values={item.synonyms} />
            {moreInfo ? <p><a href={moreInfo} rel="noopener noreferrer" target="_blank">{LocaleUtils.tr('kartenkatalog.moreInfo')} <Icon icon="info" /></a></p> : null}
        </div>);
    };
    const renderList = () => (<>
        <div className="kartenkatalog-search">
            <InputContainer>
                <span role="prefix"><Icon icon="search" /></span>
                <input aria-label={LocaleUtils.tr('kartenkatalog.searchLabel')} onChange={event => setQuery(event.target.value)}
                    placeholder={LocaleUtils.tr('kartenkatalog.searchPlaceholder')} role="input" type="search" value={query} />
                {query ? <button aria-label={LocaleUtils.tr('kartenkatalog.clearSearch')} className="kartenkatalog-icon-button" onClick={() => setQuery('')} role="suffix" type="button"><Icon icon="clear" /></button> : null}
            </InputContainer>
            <div aria-live="polite" className="kartenkatalog-count">{LocaleUtils.tr('kartenkatalog.resultCount', count,
                count === 1 ? LocaleUtils.tr('kartenkatalog.layerSingular') : LocaleUtils.tr('kartenkatalog.layerPlural'),
                filtered.length, filtered.length === 1 ? LocaleUtils.tr('kartenkatalog.themeSingular') : LocaleUtils.tr('kartenkatalog.themePlural'))}</div>
        </div>
        {!filtered.length ? <p className="kartenkatalog-empty">{LocaleUtils.tr('kartenkatalog.noResults')}</p> : null}
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
                    {!query.trim() && !expanded.has(entry.theme.identifier) ? <Description item={entry.theme} preview /> : null}
                </summary>
                {query.trim() || expanded.has(entry.theme.identifier) ? (<div className="kartenkatalog-theme-content">
                    <Description item={entry.theme} />
                    <button className="kartenkatalog-text-button kartenkatalog-theme-info" onClick={() => setDetail({theme: entry.theme, count: (catalog.find(e => e.theme.identifier === entry.theme.identifier)?.layers.length || 0)})} type="button">
                        {LocaleUtils.tr('kartenkatalog.themeInfo')}
                    </button>
                    {entry.layers.map(layer => (<div className="kartenkatalog-layer" key={layer.id}>
                        <button className="kartenkatalog-layer-title kartenkatalog-text-button" onClick={() => setDetail({theme: entry.theme, layer})} type="button">{layer.title}</button>
                        <button aria-label={LocaleUtils.tr('kartenkatalog.metadataFor', layer.title)} className="kartenkatalog-icon-button" onClick={() => setDetail({theme: entry.theme, layer})} title={LocaleUtils.tr('kartenkatalog.showMetadata')} type="button"><Icon icon="info" /></button>
                        {addButton(layer)}
                        {layer.description ? <p className="kartenkatalog-layer-description">{layer.description}</p> : null}
                        {errorMessage(layer)}
                    </div>))}
                </div>) : null}
            </details>))}
        </div>
    </>);
    return (<SideBar icon="catalog" id="Kartenkatalog" minWidth="20em" side="right" title={LocaleUtils.tr('appmenu.items.Kartenkatalog')} width={width}>
        <div className="kartenkatalog-body" role="body">
            {loading ? <div aria-live="polite" className="kartenkatalog-loading"><Spinner /> {LocaleUtils.tr('kartenkatalog.loadingCatalog')}</div> :
                loadError ? <div className="kartenkatalog-empty"><p role="alert">{errorLabel(loadError)}</p><button className="button" onClick={() => setReload(value => value + 1)} type="button"><Icon icon="refresh" /> {LocaleUtils.tr('kartenkatalog.retry')}</button></div> :
                    detail ? renderDetail() : renderList()}
        </div>
    </SideBar>);
}

Kartenkatalog.propTypes = {
    catalogUrl: PropTypes.string,
    dispatch: PropTypes.func.isRequired,
    layers: PropTypes.array.isRequired,
    locale: PropTypes.object,
    theme: PropTypes.object,
    themes: PropTypes.object,
    width: PropTypes.string
};
// Subscribe to locale changes so existing UI state and errors are translated again.
export default connect(state => ({layers: state.layers.flat, locale: state.locale, theme: state.theme.current, themes: state.theme.themes}))(Kartenkatalog);
