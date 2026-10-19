/* Icon set (24px stroke icons). Device kinds + UI. */
(function (root) {
  const P = {
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
    power: '<path d="M12 3v9"/><path d="M6.4 7.2a8 8 0 1 0 11.2 0"/>',
    router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M7 13V8M17 13V8M12 13V5"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    tablet: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M11 18h2"/>',
    laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19l-2-4h-15z"/>',
    pc: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    speaker: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><circle cx="12" cy="15" r="3"/><circle cx="12" cy="7.5" r="1"/>',
    camera: '<path d="M3 8h4l1.5-2.5h7L17 8h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><rect x="7" y="14" width="10" height="7"/>',
    game: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M7 12h4M9 10v4M15.5 11h.01M17.5 13h.01"/>',
    iot: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    nas: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="13" y="13" width="0" height="0"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    hub: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    unknown: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    wifi: '<path d="M3 9a13 13 0 0 1 18 0M6 13a8 8 0 0 1 12 0M9.5 16.5a3.5 3.5 0 0 1 5 0"/><circle cx="12" cy="20" r=".8"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="M12 12l6-6"/>',
    mesh: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M10.5 7l-4 9M13.5 7l4 9M7.5 18h9"/>',
    port: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7v4M10 7v4M13 7v4M16 7v4"/>',
    trace: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h6a3 3 0 0 1 0 6h-2a3 3 0 0 0 0 6h6"/>',
    walk: '<circle cx="13" cy="4.5" r="2"/><path d="M9 21l2-6 3 2v4M11 15l-1-5 4-1 2 4 3 1M10 10L7 12"/>',
    zigbee: '<path d="M4 6h14L6 18h14"/>',
    book: '<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6M20 4v14h-6"/>',
    dns: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    report: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>',
    modem: '<rect x="3" y="12" width="18" height="8" rx="2"/><path d="M7 16h.01M11 16h.01M8 12V6l8-2v8"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
    check: '<path d="M5 12l5 5 9-10"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>'
  };
  const svg = (n, extra) => `<svg viewBox="0 0 24 24" ${extra || ''}>${P[n] || P.unknown}</svg>`;
  root.Icons = { P, svg, has: n => !!P[n],
    el(n, cls) { const d = document.createElement('div'); d.className = 'ic ' + (cls || ''); d.innerHTML = svg(n); return d; } };
})(window);
