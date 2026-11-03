import React, {useEffect, useRef} from 'react';

import PropTypes from 'prop-types';

/** A shared hover region keeps the preview when moving between title and description. */
export default function LayerPreview({badge, entry, group, onClear, onOpen, onPreview}) {
    const interaction = useRef({hover: false, focus: false, touch: false});
    useEffect(() => () => onClear(entry), [entry, onClear]);
    const enter = source => {
        interaction.current[source] = true;
        if (!group) onPreview(entry);
    };
    const leave = source => {
        interaction.current[source] = false;
        if (!interaction.current.hover && !interaction.current.focus) onClear(entry);
    };
    return (<div className="kartenkatalog-layer-preview"
        onPointerEnter={event => { if (event.pointerType === 'mouse') enter('hover'); }}
        onPointerLeave={() => leave('hover')}>
        <div className="kartenkatalog-layer-heading">
            <button className="kartenkatalog-layer-title kartenkatalog-text-button"
                onBlur={() => { interaction.current.touch = false; leave('focus'); }}
                onClick={() => { onClear(entry); onOpen(); }}
                onFocus={() => { if (!interaction.current.touch) enter('focus'); }}
                onKeyDown={event => { if (event.key === 'Escape') onClear(entry); }}
                onPointerDown={event => { interaction.current.touch = event.pointerType === 'touch'; }}
                type="button">{entry.title}</button>
            {badge}
        </div>
        {entry.description ? <p className="kartenkatalog-layer-description">{entry.description}</p> : null}
    </div>);
}
LayerPreview.propTypes = {
    badge: PropTypes.node,
    entry: PropTypes.object.isRequired,
    group: PropTypes.bool.isRequired,
    onClear: PropTypes.func.isRequired,
    onOpen: PropTypes.func.isRequired,
    onPreview: PropTypes.func.isRequired
};
