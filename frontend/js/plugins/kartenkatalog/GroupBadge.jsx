import React, {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

import PropTypes from 'prop-types';

export default function GroupBadge({hint, label}) {
    const id = useId();
    const anchor = useRef(null);
    const tooltip = useRef(null);
    const hover = useRef(false);
    const focused = useRef(false);
    const timer = useRef(null);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({left: 0, top: 0});
    const show = () => { clearTimeout(timer.current); setOpen(true); };
    const hide = () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { if (!hover.current && !focused.current) setOpen(false); }, 100);
    };
    useEffect(() => () => clearTimeout(timer.current), []);
    useEffect(() => {
        if (!open) return undefined;
        const dismiss = () => setOpen(false);
        const onKey = event => { if (event.key === 'Escape') dismiss(); };
        window.addEventListener('keydown', onKey);
        window.addEventListener('scroll', dismiss, true);
        window.addEventListener('resize', dismiss);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', dismiss, true);
            window.removeEventListener('resize', dismiss);
        };
    }, [open]);
    useLayoutEffect(() => {
        if (!open) return;
        const rect = anchor.current.getBoundingClientRect();
        const popup = tooltip.current.getBoundingClientRect();
        setPosition({left: Math.max(8, Math.min(rect.left, window.innerWidth - popup.width - 8)),
            top: rect.bottom + 6 + popup.height <= window.innerHeight - 8 ? rect.bottom + 6 : Math.max(8, rect.top - popup.height - 6)});
    }, [open, hint]);
    return (<>
        <button aria-describedby={open ? id : undefined} className="kartenkatalog-group-badge"
            onBlur={() => { focused.current = false; hide(); }} onClick={show}
            onFocus={() => { focused.current = true; show(); }}
            onMouseEnter={() => { hover.current = true; show(); }} onMouseLeave={() => { hover.current = false; hide(); }}
            ref={anchor} type="button">{label}</button>
        {open ? createPortal(<span className="kartenkatalog-group-tooltip" id={id}
            onMouseEnter={() => { hover.current = true; clearTimeout(timer.current); }}
            onMouseLeave={() => { hover.current = false; hide(); }} ref={tooltip} role="tooltip" style={position}>{hint}</span>, document.body) : null}
    </>);
}
GroupBadge.propTypes = {hint: PropTypes.string.isRequired, label: PropTypes.string.isRequired};
