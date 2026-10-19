/* ARC Signal - Wi-Fi (bands, mesh, radar, rogue), Devices, Help */
(function () {
  'use strict';
  const A = window.App, C = window.Core, N = window.Native, K = window.KB, Ch = window.Charts, h = A.h;
  const bandCol = b => b === '2.4 GHz' ? '#f59e0b' : b === '5 GHz' ? '#3b82f6' : '#a855f7';
  const stdOf = n => n.standard || (n.band === '6 GHz' ? 'Wi-Fi 6E' : '');
  const dot = c => h('i', { style: `width:12px;height:12px;border-radius:50%;background:${c};display:inline-block;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.3)` });
  const needApp = (root, what) => root.append(A.lockCard(what));
  A.needApp = needApp;

  /* ================= MESH ANALYZER (sheet) ================= */
  A.meshSheet = async function (ssid) {
    const nets = A.ctx.nets || []; if (!nets.length) return;
    const r = C.meshAnalyze(ssid, nets, A.mine()), name = ssid || '(hidden network)', body = h('div', {}), adv = A.adv();
    const byBand = ['2.4 GHz', '5 GHz', '6 GHz'].map(b => ({ label: b, value: nets.filter(n => n.ssid === ssid && n.band === b).length, color: bandCol(b) }));
    const sc = r.score >= 75 ? 'good' : r.score >= 50 ? 'warn' : 'bad';
    body.append(h('div', { class: 'row', style: 'margin-bottom:6px' }, dot(Ch.ssidColor(ssid)), h('div', { class: 'grow' }, h('div', { class: 'head', style: 'font-size:20px;font-weight:800' }, name), h('div', { class: 'small mute' }, `${r.clusters.length} access point${r.clusters.length === 1 ? '' : 's'} | ${nets.filter(n => n.ssid === ssid).length} radios in range`)), h('button', { class: 'sm ghost', onclick: () => sh.close() }, 'Close')),
      h('div', { class: 'grid2', style: 'margin:10px 0' }, h('div', { class: 'card', style: 'margin:0' }, h('h2', {}, 'Mesh health'), Ch.ring(r.score, { size: 150, label: r.score >= 75 ? 'Good' : r.score >= 50 ? 'Fair' : 'Needs work', tone: sc })), h('div', { class: 'card', style: 'margin:0' }, h('h2', {}, 'Radios by band'), Ch.donutCard(byBand, { size: 140, big: byBand.reduce((s, x) => s + x.value, 0), small: 'radios' }))));
    body.append(h('div', { class: 'card' }, h('h2', {}, `Findings (${r.findings.length})`), r.findings.length ? r.findings.map(A.finding) : h('div', { class: 'good', style: 'font-weight:600' }, 'No problems found with this network from where you are standing.')));
    if (r.plan.length) body.append(h('div', { class: 'card' }, h('h2', {}, 'Suggested channel plan'), h('div', { class: 'small mute', style: 'margin-bottom:8px' }, 'Picks the least-crowded non-overlapping channels, avoiding DFS on 5 GHz, and keeps each node on a different channel.'),
      h('table', {}, h('tr', {}, ['Band', 'Node', 'Now', 'Set to', 'Width'].map(x => h('th', {}, x))), r.plan.map(p => h('tr', {}, h('td', {}, p.band), h('td', {}, '#' + p.node), h('td', {}, p.current), h('td', { class: p.change ? 'warn' : 'good', style: 'font-weight:700' }, p.suggested + (p.change ? '' : ' (ok)')), h('td', {}, p.width + ' MHz'))))));
    if (!adv) { body.append(h('div', { class: 'small mute' }, 'Switch to Advanced mode for per-radio details, channel utilization, roaming support and the walk test.')); }
    else {
      body.append(h('h2', { class: 'head', style: 'font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);margin:16px 0 6px' }, 'Nodes and radios (grouped by hardware address; heuristic)'));
      r.clusters.forEach(c => {
        const best = c.radios.slice().sort((a, b) => b.level - a.level)[0], vend = A.ctx.vendors && A.ctx.vendors[best.bssid];
        const node = h('div', { class: 'node' }, h('div', { class: 'row sp' }, h('div', {}, h('b', {}, `Node ${c.id}`), vend ? h('span', { class: 'small mute' }, '  ' + vend) : null), h('div', { class: 'small mute' }, `~${Ch.distance(best.level, best.band).toFixed(0)} m away (rough)`)));
        c.radios.forEach(n => { const ri = C.rssiInfo(n.level), me = A.mine() === n.bssid;
          node.append(h('div', { class: 'radio' }, h('span', { class: 'pill', style: `color:${bandCol(n.band)};border-color:${bandCol(n.band)}` }, n.band), h('span', { style: 'font-weight:700' }, 'ch ' + n.channel), h('span', { class: 'mute' }, n.width + ' MHz'), h('span', { class: ri.tone, style: 'font-weight:700' }, n.level + ' dBm'),
            n.standard ? h('span', { class: 'tag' }, n.standard.replace('Wi-Fi ', 'W')) : null, h('span', { class: 'tag' }, n.security), n.k !== undefined ? [h('span', { class: 'tag' + (n.k ? ' on' : '') }, 'k'), h('span', { class: 'tag' + (n.v ? ' on' : '') }, 'v'), h('span', { class: 'tag' + (n.r ? ' on' : '') }, 'r')] : null,
            me ? h('span', { class: 'pill good' }, 'CONNECTED') : null, h('span', { class: 'xs mute', style: 'width:100%' }, n.bssid + (n.util != null ? `   airtime ${Math.round(n.util / 2.55)}%  clients ${n.stations ?? '?'}` : '')),
            n.util != null ? h('div', { class: 'bar', style: 'width:100%;height:6px' }, h('i', { style: `width:${n.util / 2.55}%;background:linear-gradient(90deg,var(--good),${n.util > 190 ? 'var(--bad)' : n.util > 128 ? 'var(--warn)' : 'var(--acc2)'})` })) : null)); });
        body.append(node); });
      body.append(h('div', { class: 'small mute' }, 'k = 802.11k neighbour reports, v = 802.11v BSS transition, r = 802.11r fast roaming. Airtime and client counts come from the AP\'s BSS Load field when it publishes one. Distances are rough: walls and obstructions change the estimate a lot. Your phone cannot see how nodes connect to each other (wired or wireless backhaul), only how they look from where you stand. Walk the home and scan in several rooms for the full picture.'));
      body.append(h('div', { class: 'row wrap', style: 'margin-top:14px' }, h('button', { onclick: () => { sh.close(); A.tools.roam(ssid); } }, 'Walk test (roaming)'), h('button', { class: 'ghost', onclick: () => { sh.close(); A.go('wifi', 'radar'); } }, 'Show on radar')));
    }
    const sh = A.sheet(body);
  };

  /* ================= WI-FI ================= */
  const SUBHINT = { overview: 'Summary: health score, crowding and problems found.', bands: 'Which channels each network uses. Tall = strong. Overlapping shapes = crowding.', mesh: 'Networks made of several routers or nodes, and whether they work well together.', radar: 'Rough distance to each network. Closer to the middle = stronger.', rogue: 'Fake, look-alike or suspicious networks.', list: 'Every network in one table.' };
  A.views.wifi = function (root, arg) {
    const web = !N.live;
    if (web) root.append(A.connBar());
    if (web && !A.ctx.nets) {
      const opt = (ic, t, d, extra) => h('div', { class: 'row', style: 'align-items:flex-start;padding:12px 0;border-top:1px solid var(--glass-line)' }, h('div', { class: 'ic sm', html: Icons.svg(ic) }), h('div', { class: 'grow' }, h('b', {}, t), h('div', { class: 'small mute' }, d), extra || null));
      root.append(h('div', { class: 'card banner' }, h('h2', {}, 'See the Wi-Fi networks around you'), h('div', { class: 'small' }, 'Shows every Wi-Fi network in range (often up to about 300 feet), how strong each one is, and which ones are crowding each other. You do not have to be connected to Wi-Fi, but the device has to be allowed to scan.')),
        A.card('How to get this on your device', opt('phone', 'Android phone: the full app', 'Scans on demand, even on mobile data. If your phone is sharing a hotspot, turn the hotspot off first so the Wi-Fi radio is free to scan.', h('button', { class: 'sm', style: 'margin-top:8px', onclick: () => A.lockSheet('Scanning Wi-Fi from your phone') }, 'Get the full Android app')), opt('wifi', 'Right here, on the website (for techs)', 'No app: run one command on a Windows PC, paste the result here, and the graphs appear.', h('button', { class: 'sm ghost', style: 'margin-top:8px', onclick: () => A.importSheet(() => A.go('wifi')) }, 'Paste a scan'))),
        A.card('What the words mean', h('div', { class: 'col small' }, [['Bands (2.4 / 5 / 6 GHz)', 'Different "lanes" for Wi-Fi. 2.4 reaches far but is slow and crowded. 5 and 6 are faster but shorter range.'], ['Channels', 'Each lane has numbered channels. Two networks on the same channel slow each other down.'], ['Mesh', 'A Wi-Fi system with several units (nodes) sharing one name. We check that they do not fight each other.'], ['Look-alike / rogue networks', 'A network with almost your name, or open with no password. Could be a neighbor, could be a trap.']].map(([t, d]) => h('div', {}, h('b', {}, t), h('div', { class: 'mute' }, d))))),
        A.card('What breaks Wi-Fi', h('div', { class: 'list' }, K.BASICS.map(([t, d]) => h('div', { style: 'padding:9px 0;border-top:1px solid var(--glass-line)' }, h('b', {}, t), h('div', { class: 'small mute' }, d)))))); return; }
    const adv = A.adv(); let sub = adv ? (arg || 'overview') : 'easy';
    const curCard = A.card(null), scanRow = h('div', { class: 'row', style: 'margin-bottom:14px' }), body = h('div', {});
    const scanBtn = h('button', { class: 'sm' }, web ? 'Load a new scan' : 'Scan again'), status = h('span', { class: 'small mute grow' });
    scanRow.append(scanBtn, status);
    if (web) scanRow.append(h('button', { class: 'sm ghost', onclick: () => { A.clearImport(); A.go('wifi'); } }, 'Clear')); else scanRow.append(h('button', { class: 'sm ghost', onclick: () => A.exportScan() }, 'Export'));
    if (adv) { const tabs = [['overview', 'Overview'], ['bands', 'Bands'], ['mesh', 'Mesh'], ['radar', 'Radar'], ['rogue', 'Rogue'], ['list', 'Networks']];
      var st = h('div', { class: 'subtabs' }, tabs.map(([id, l]) => h('button', { class: sub === id ? '' : 'ghost', onclick: () => { sub = id; [...st.children].forEach((b, i) => b.className = tabs[i][0] === id ? '' : 'ghost'); const hh = document.getElementById('subhint'); if (hh) hh.textContent = SUBHINT[id] || ''; stopRadar(); render(); } }, l))); }
    if (!web) root.append(A.connBar());
    root.append(curCard); if (adv) root.append(st); if (adv) root.append(h('div', { class: 'small mute', id: 'subhint', style: 'margin:-4px 0 12px' }, SUBHINT[sub] || '')); root.append(scanRow, body);
    let radar = null; const stopRadar = () => { if (radar) { radar.stop(); radar = null; } }; A.cleanup(stopRadar);

    function drawCur() {
      if (web) { const ys = A.ctx.nets ? [...new Set(A.ctx.nets.map(n => n.ssid).filter(Boolean))] : []; const mineS = A.mine() && (A.ctx.nets.find(n => n.bssid === A.mine()) || {}).ssid;
        curCard.replaceChildren(h('h2', {}, 'Loaded scan'), h('div', { class: 'small mute' }, `${A.ctx.importSrc || 'Imported'} | ${new Date(A.ctx.scanAt).toLocaleString()}`),
          mineS ? h('div', { class: 'row', style: 'margin-top:8px' }, dot(Ch.ssidColor(mineS)), h('span', {}, 'Your network: '), h('b', {}, mineS), h('button', { class: 'sm ghost', onclick: () => { A.store.set('mineSsid', null); A.ctx.mineBssid = null; A.pickMine(null).then(render); drawCur(); } }, 'Change')) : h('div', {}, h('div', { class: 'small', style: 'margin:10px 0 6px' }, 'Which one is yours? (helps spot look-alikes and rogue copies)'), h('div', { class: 'chips' }, ys.map(y => h('span', { class: 'chip', onclick: async () => { await A.pickMine(y); drawCur(); render(); } }, h('i', { class: 'dot', style: `background:${Ch.ssidColor(y)}` }), y)))));
        return; }
      const w = A.ctx.wifi; if (!w || !w.ssid) { curCard.replaceChildren(h('h2', {}, 'Connected network'), h('div', { class: 'small mute' }, w && w.locationOn === false ? 'Turn on Location: Android hides the network name and scan results when it is off.' : 'Not connected to Wi-Fi.')); return; }
      const r = C.rssiInfo(w.rssi), ch = C.channelOf(w.frequency), band = C.bandOf(w.frequency);
      curCard.replaceChildren(h('div', { class: 'row sp' }, h('div', { class: 'row grow', style: 'cursor:pointer', onclick: () => A.meshSheet(w.ssid) }, dot(Ch.ssidColor(w.ssid)), h('div', {}, h('div', { class: 'head', style: 'font-weight:800;font-size:19px' }, w.ssid), h('div', { class: 'small mute' }, `${band} | channel ${ch} | ${w.standard || ''}`))),
        h('div', { style: 'text-align:right' }, h('div', { class: 'head ' + r.tone, style: 'font-weight:800;font-size:24px' }, w.rssi + ' dBm'), h('div', { class: 'small ' + r.tone }, r.label))),
        h('div', { class: 'bar', style: 'margin:10px 0' }, h('i', { style: `width:${r.pct}%` })),
        adv ? h('div', { class: 'grid' }, [['Link speed', `${w.linkSpeed || '?'} Mbps`], ['Down / up link', `${w.rxLinkSpeed || '?'} / ${w.txLinkSpeed || '?'}`], ['Width', w.width ? w.width + ' MHz' : '-'], ['IP', w.ip || '-'], ['Gateway', w.gateway || '-'], ['BSSID', w.bssid || '-']].map(([l, v]) => A.st(v, l))) : h('div', { class: 'small' }, r.note),
        h('div', { class: 'xs mute', style: 'margin-top:8px' }, 'Tap the name to analyze this network\'s mesh.'));
    }
    drawCur(); if (!web) A.every(2500, async () => { await A.readWifi(); drawCur(); });

    async function doScan() {
      scanBtn.disabled = true; scanBtn.textContent = 'Scanning...'; status.textContent = '';
      try { await A.scan(); } catch (e) { body.replaceChildren(h('div', { class: 'card bad' }, 'Scan failed: ' + (e.message || e))); }
      scanBtn.disabled = false; scanBtn.textContent = 'Scan again'; render();
    }
    scanBtn.onclick = web ? () => A.importSheet(() => { drawCur(); render(); }) : doScan;
    if (web) render(); else if (!A.ctx.nets || Date.now() - A.ctx.scanAt > 120000) doScan(); else render();

    function listChips(nets, filterBand) {
      const ss = [...new Set(nets.filter(n => !filterBand || n.band === filterBand).map(n => n.ssid))];
      return h('div', { class: 'chips', style: 'margin-top:10px' }, ss.map(s => h('span', { class: 'chip', onclick: () => A.meshSheet(s) }, h('i', { class: 'dot', style: `background:${Ch.ssidColor(s)}` }), s || '(hidden)', h('span', { class: 'mute xs' }, nets.filter(n => n.ssid === s && (!filterBand || n.band === filterBand)).length))));
    }
    function wifiScore() { const f = A.ctx.findings || [], w = A.ctx.wifi; let s = 100 - f.reduce((a, x) => a + x.sev * 7, 0); if (w && w.rssi < -70) s -= 10; s -= (A.ctx.rogue ? A.ctx.rogue.findings.filter(x => x.sev >= 3).length * 8 : 0); return Math.max(8, Math.min(100, s)); }
    function bandPie(nets) { return ['2.4 GHz', '5 GHz', '6 GHz'].map(b => ({ label: b, value: nets.filter(n => n.band === b).length, color: bandCol(b) })); }

    function render() {
      const nets = A.ctx.nets; if (!nets) return; const w = A.ctx.wifi, mine = A.mine(); const me = nets.find(n => n.bssid === mine);
      status.textContent = web ? `${nets.length} networks loaded` : `${nets.length} networks, ${Math.round((Date.now() - A.ctx.scanAt) / 1000)} s ago` + (A.ctx.throttled ? ' (Android reused a cached scan)' : '');
      const bandMapCard = (band, title) => { const has = nets.some(n => n.band === band); const cardEl = A.card(title || band, has ? Ch.bandMap(nets, band, { me: mine, onPick: s => A.meshSheet(s) }) : h('div', { class: 'small mute' }, band === '6 GHz' ? 'No 6 GHz networks seen. Either none nearby, or this phone / region does not support 6 GHz scanning.' : 'No networks on this band.'), has ? listChips(nets, band) : null);
        if (has && band === '2.4 GHz') { const b = C.bestChannel24(nets); cardEl.append(h('div', { class: 'small mute', style: 'margin-top:8px' }, `Least crowded of channels 1 / 6 / 11: ${b.best}.`)); } return cardEl; };
      if (sub === 'easy') {
        const sc = wifiScore(), rg = A.ctx.rogue.findings.slice(0, 2), f = (A.ctx.findings || []).slice(0, 4);
        body.replaceChildren(A.card(null, h('div', { class: 'row wrap', style: 'justify-content:center;gap:16px' }, Ch.ring(sc, { size: 150, label: 'Wi-Fi health' }), h('div', { class: 'grow', style: 'min-width:190px' }, h('div', { class: 'head', style: 'font-weight:800;font-size:18px' }, sc >= 80 ? 'Your Wi-Fi looks healthy' : sc >= 55 ? 'A few things to improve' : 'Wi-Fi problems found'), h('div', { class: 'small mute', style: 'margin-top:4px' }, `${nets.length} Wi-Fi networks around you. Tap a name below to check that network.`)))),
          A.card('Problems found', rg.concat(f).length ? rg.concat(f).map(A.finding) : h('div', { class: 'good', style: 'font-weight:600' }, 'No problems found.')),
          me ? bandMapCard(me.band, `Channels around you (${me.band})`) : bandMapCard('2.4 GHz', 'Channels around you'), A.card('Nearby networks', listChips(nets)));
        return;
      }
      if (sub === 'overview') {
        const sc = wifiScore(), mineBand = me ? me.band : '2.4 GHz', onBand = nets.filter(n => n.band === mineBand), byCh = {}; onBand.forEach(n => { byCh[n.channel] = (byCh[n.channel] || 0) + 1; });
        const chData = Object.entries(byCh).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, v], i) => ({ label: 'Ch ' + c, value: v, color: `hsl(${(i * 47 + 200) % 360} 72% 56%)` }));
        body.replaceChildren(h('div', { class: 'grid2' }, A.card('Wi-Fi health', Ch.ring(sc, { size: 150, label: 'score' })), A.card('Networks by band', Ch.donutCard(bandPie(nets), { size: 150, big: nets.length, small: 'networks' }))),
          A.card(`Channel crowding (${mineBand})`, Ch.donutCard(chData, { size: 150, big: onBand.length, small: 'on this band' }), me ? h('div', { class: 'small mute', style: 'margin-top:8px' }, `You are on channel ${me.channel}, shared with ${onBand.filter(n => n.channel === me.channel && n.bssid !== me.bssid).length} other radios.`) : null),
          A.card(`Findings (${(A.ctx.findings || []).length})`, (A.ctx.findings || []).length ? A.ctx.findings.map(A.finding) : h('div', { class: 'good', style: 'font-weight:600' }, 'No Wi-Fi problems found in this scan.')),
          A.card('Tap a network to analyze it', listChips(nets)), web ? null : traceCard());
      } else if (sub === 'bands') {
        body.replaceChildren(bandMapCard('2.4 GHz', '2.4 GHz channels'), bandMapCard('5 GHz', '5 GHz channels'), bandMapCard('6 GHz', '6 GHz channels (Wi-Fi 6E / 7)'),
          h('div', { class: 'small mute' }, 'Each colour is one network name. Taller = stronger signal at your phone. Width shows channel width. Tap any shape to open that network.'));
      } else if (sub === 'mesh') {
        const groups = {}; nets.forEach(n => { (groups[n.ssid] = groups[n.ssid] || []).push(n); });
        const rows = Object.entries(groups).map(([s, l]) => ({ s, l, nodes: C.ssidClusters(l).length })).sort((a, b) => (b.s === (me && me.ssid)) - (a.s === (me && me.ssid)) || b.nodes - a.nodes || b.l.length - a.l.length);
        body.replaceChildren(A.card('Mesh and multi-AP networks', h('div', { class: 'small mute', style: 'margin-bottom:6px' }, 'Every network name is grouped into the access points (nodes) and radios your phone can hear. Tap one for the mesh analyzer: overlap, roaming support, channel plan.'),
          rows.map(r => h('div', { class: 'dev', onclick: () => A.meshSheet(r.s) }, h('div', { class: 'ic sm', style: `background:linear-gradient(150deg,${Ch.ssidColor(r.s)},color-mix(in srgb,${Ch.ssidColor(r.s)} 70%,#000))` , html: Icons.svg('mesh') }), h('div', { class: 'grow' }, h('b', {}, r.s || '(hidden)'), me && r.s === me.ssid ? h('span', { class: 'pill good', style: 'margin-left:6px' }, 'YOURS') : null, h('div', { class: 'small mute' }, `${r.nodes} node${r.nodes === 1 ? '' : 's'}, ${r.l.length} radios`)), h('div', { class: 'row', style: 'gap:4px' }, ['2.4 GHz', '5 GHz', '6 GHz'].filter(b => r.l.some(n => n.band === b)).map(b => h('span', { class: 'pill', style: `color:${bandCol(b)};border-color:${bandCol(b)}` }, b.replace(' GHz', ''))))))));
      } else if (sub === 'radar') {
        const cv = h('canvas', { style: 'height:340px' }), sel = h('div', { class: 'small mute' }, 'Tap a blip to select it. Closer to the centre = stronger signal.');
        body.replaceChildren(A.card('Radar locator', cv, h('div', { class: 'xs mute', style: 'margin-top:6px' }, 'Distance is estimated from signal strength. Direction is not measured by a phone, so the angle is just a stable position for each device. Use Hunt mode to actually find one: walk around and watch the number climb.'), sel), A.card('Legend', h('div', { class: 'legend' }, h('div', { class: 'li' }, h('i', { style: 'background:var(--tx);border-radius:50%' }), 'Plain = 2.4 GHz'), h('div', { class: 'li' }, h('i', { style: 'border:2px solid var(--tx);border-radius:50%' }), 'Ring = 5 / 6 GHz'), h('div', { class: 'li' }, 'Bigger = stronger')), listChips(nets)));
        stopRadar(); radar = Ch.radar(cv, () => A.ctx.nets || [], { onPick: n => { const rg = A.ctx.rogue.by[n.bssid]; sel.replaceChildren(h('div', { class: 'row sp' }, h('div', {}, h('b', {}, n.ssid || '(hidden)'), h('div', { class: 'small mute' }, `${n.bssid} | ${n.band} ch ${n.channel} | ${n.level} dBm | ~${Ch.distance(n.level, n.band).toFixed(0)} m`), rg && rg.sev > 0 ? h('div', { class: 'small ' + A.tone(rg.sev >= 3 ? 2 : 1) }, rg.reasons.join('; ')) : null), h('div', { class: 'col' }, h('button', { class: 'sm', onclick: () => A.tools.hunt(n) }, 'Hunt this'), h('button', { class: 'sm ghost', onclick: () => A.meshSheet(n.ssid) }, 'Details')))); } });
      } else if (sub === 'rogue') {
        const R = A.ctx.rogue, flagged = nets.filter(n => R.by[n.bssid] && R.by[n.bssid].sev > 0).sort((a, b) => R.by[b.bssid].sev - R.by[a.bssid].sev), hidden = nets.filter(n => !n.ssid);
        body.replaceChildren(A.card(`Rogue / suspicious (${R.findings.length})`, R.findings.length ? R.findings.map(f => { const el = A.finding(f); return el; }) : h('div', { class: 'good', style: 'font-weight:600' }, 'Nothing suspicious in this scan.'), h('div', { class: 'small mute', style: 'margin-top:10px' }, 'Checks: look-alike names, your name with no or different security, your name on different hardware, one device broadcasting many names, strong hidden networks, illegal channels, weak security. Heuristics: a flag means "go look", not "proven rogue".')),
          A.card(`All flagged networks (${flagged.length})`, flagged.length ? flagged.map(n => h('div', { class: 'dev', onclick: () => A.tools.hunt(n) }, dot(Ch.ssidColor(n.ssid)), h('div', { class: 'grow' }, h('b', {}, n.ssid || '(hidden)'), h('div', { class: 'small mute' }, `${n.bssid} | ${n.band} ch ${n.channel} | ${n.level} dBm`), h('div', { class: 'small ' + A.tone(R.by[n.bssid].sev >= 3 ? 2 : R.by[n.bssid].sev >= 1 ? 1 : 0) }, R.by[n.bssid].reasons.join('; '))), h('button', { class: 'sm ghost' }, 'Hunt'))) : h('div', { class: 'small mute' }, 'None.')),
          A.card(`Hidden networks (${hidden.length})`, hidden.length ? hidden.map(n => h('div', { class: 'row sp small', style: 'padding:6px 0' }, h('span', {}, `${n.bssid}  ${A.ctx.vendors[n.bssid] || ''}`), h('span', {}, `${n.band} ch ${n.channel}  ${n.level} dBm`))) : h('div', { class: 'small mute' }, 'None seen.')));
      } else {
        body.replaceChildren(A.card(`All networks (${nets.length})`, h('div', { style: 'overflow-x:auto' }, h('table', { style: 'min-width:640px' }, h('tr', {}, ['', 'Name', 'Maker', 'Band', 'Ch', 'Width', 'dBm', 'Security', 'Std', 'Air'].map(x => h('th', {}, x))),
          nets.map(n => h('tr', { style: 'cursor:pointer', onclick: () => A.meshSheet(n.ssid) }, h('td', {}, dot(Ch.ssidColor(n.ssid))), h('td', {}, n.ssid || '(hidden)', n.bssid === mine ? h('span', { class: 'pill good', style: 'margin-left:5px' }, 'YOU') : null), h('td', { class: 'xs' }, A.ctx.vendors[n.bssid] || ''), h('td', {}, n.band.replace(' GHz', '')), h('td', {}, n.channel), h('td', {}, n.width), h('td', { class: C.rssiInfo(n.level).tone }, n.level), h('td', { class: 'xs' }, n.security), h('td', { class: 'xs' }, stdOf(n).replace('Wi-Fi ', '')), h('td', {}, n.util != null ? Math.round(n.util / 2.55) + '%' : '-')))))));
      }
    }
    function traceCard() {
      const b = h('button', { class: 'sm', style: 'margin-top:8px' }, 'Run trace route'), o = h('div', {});
      b.onclick = async () => { b.disabled = true; o.replaceChildren(h('div', { class: 'small mute' }, 'Tracing...'));
        try { const r = await N.call('traceroute', { host: '1.1.1.1', maxHops: 12 }), f = C.analyzeHops(r.hops);
          o.replaceChildren(h('table', {}, h('tr', {}, ['#', 'Hop', 'ms'].map(x => h('th', {}, x))), r.hops.map(x => h('tr', {}, h('td', {}, x.ttl), h('td', {}, x.ip || '*'), h('td', {}, x.rtt > 0 ? x.rtt.toFixed(1) : '-')))), f.length ? f.map(A.finding) : h('div', { class: 'good small', style: 'margin-top:8px' }, 'Single router path. No double NAT detected.')); } catch (e) { o.replaceChildren(h('div', { class: 'bad' }, e.message)); }
        b.disabled = false; };
      return A.card('Network checks', h('div', { class: 'small mute' }, 'Trace route to the internet: detects double NAT (a second router routing) and slow first hops.'), b, o);
    }
  };

  /* ================= DEVICES ================= */
  const devKey = d => (d.mac && d.mac !== '02:00:00:00:00:00' ? d.mac : d.ip).toLowerCase();
  const KIND_COL = { router: '#3b82f6', phone: '#10b981', tablet: '#14b8a6', laptop: '#8b5cf6', pc: '#6366f1', tv: '#f59e0b', speaker: '#ec4899', camera: '#ef4444', printer: '#64748b', game: '#a855f7', iot: '#eab308', nas: '#0ea5e9', hub: '#22c55e', unknown: '#94a3b8' };
  A.views.devices = function (root) {
    if (!N.live) { root.append(A.connBar()); needApp(root, 'Finding devices, port checks and vulnerability flags');
      root.append(A.card('What the app finds', h('div', { class: 'col small' }, ['Every device on your network with its icon: phone, TV, laptop, camera, printer, router...', 'New-device alerts', 'Open ports and risky services (Telnet, RDP, SMB, camera streams, ADB, UPnP)', 'Old server software with known weaknesses', 'Per-device live latency, so you can spot the one that keeps dropping', 'Watch list that logs every time a device goes offline'].map(t => h('div', { class: 'row' }, h('span', { class: 'good' }, '✓'), t))))); return; }
    const adv = A.adv(), known = A.store.get('known', {}), watch = new Set(A.store.get('watch', []));
    let devices = A.ctx.devices || [];
    const scanBtn = h('button', {}, devices.length ? 'Rescan' : 'Scan network'), prog = h('div', { class: 'bar hide', style: 'margin-top:10px' }, h('i', { style: 'width:0' })), sub = h('div', { class: 'small mute' }, 'Sweeps your network. Takes 10-30 s.');
    const charts = h('div', {}), list = A.card(null);
    root.append(A.card(null, h('div', { class: 'row sp' }, h('div', {}, h('b', {}, 'Devices on your network'), sub), scanBtn), prog), charts, list);
    const kindOf = d => d.kind || (d.kind = C.guessKind(d.vendor, known[devKey(d)] && known[devKey(d)].label || d.name, d.ports, d.banner));
    function paint() {
      const ip2n = ip => ip.split('.').map(Number).reduce((x, y) => x * 256 + y); devices.sort((a, b) => ip2n(a.ip) - ip2n(b.ip));
      const kinds = {}; devices.forEach(d => { const k = kindOf(d); kinds[k] = (kinds[k] || 0) + 1; });
      const kd = Object.entries(kinds).map(([k, v]) => ({ label: C.KINDS[k], value: v, color: KIND_COL[k] })).sort((a, b) => b.value - a.value);
      const newCount = devices.filter(d => !known[devKey(d)]).length, risky = devices.filter(d => d.risk >= 40).length;
      const rk = [['High risk', devices.filter(d => d.risk >= 40).length, Ch.css('bad')], ['Check', devices.filter(d => d.risk >= 15 && d.risk < 40).length, Ch.css('warn')], ['OK', devices.filter(d => d.risk != null && d.risk < 15).length, Ch.css('good')], ['Not checked', devices.filter(d => d.risk == null).length, '#94a3b8']].map(([label, value, color]) => ({ label, value, color }));
      charts.replaceChildren(devices.length ? h('div', { class: 'grid2' }, A.card('By type', Ch.donutCard(kd, { size: 150, big: devices.length, small: 'devices' })), adv ? A.card('Risk', Ch.donutCard(rk, { size: 150, big: risky, small: 'high risk' })) : A.card('Summary', h('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr' }, A.st(devices.length, 'Online'), A.st(newCount, 'New'), A.st(risky, 'Risky'), A.st(watch.size, 'Watching')))) : null);
      list.replaceChildren(devices.length ? devices.map(d => { const kind = kindOf(d), lbl = (known[devKey(d)] && known[devKey(d)].label) || d.name || d.vendor || 'Unknown device', isNew = !known[devKey(d)];
        return h('div', { class: 'dev', onclick: () => detail(d) }, h('div', { class: 'ic', style: `background:linear-gradient(150deg,${KIND_COL[kind]},color-mix(in srgb,${KIND_COL[kind]} 65%,#000))`, html: Icons.svg(kind) }),
          h('div', { class: 'grow' }, h('div', {}, h('b', {}, lbl), isNew ? h('span', { class: 'pill warn', style: 'margin-left:6px' }, 'NEW') : null, watch.has(devKey(d)) ? h('span', { class: 'pill info', style: 'margin-left:6px' }, 'WATCH') : null),
            h('div', { class: 'small mute' }, `${C.KINDS[kind]}${d.vendor ? ' | ' + d.vendor : ''}`), adv ? h('div', { class: 'xs mute' }, `${d.ip}${d.mac ? ' | ' + d.mac : ''}`) : null),
          h('div', { style: 'text-align:right' }, h('div', { class: 'small' }, d.rtt > 0 ? C.fmt.ms(d.rtt) : '-'), d.risk != null ? h('span', { class: 'pill ' + (d.risk >= 40 ? 'bad' : d.risk >= 15 ? 'warn' : 'good') }, d.risk >= 40 ? 'RISK' : d.risk >= 15 ? 'CHECK' : 'OK') : null)); }) : h('div', { class: 'small mute' }, 'No scan yet. Tap Scan network.'));
    }
    paint();
    scanBtn.onclick = async () => {
      scanBtn.disabled = true; prog.classList.remove('hide'); const seen = []; sub.textContent = 'Scanning...';
      const cb = (d, f) => { seen.push(d); prog.firstChild.style.width = (f * 100) + '%'; devices = seen.slice(); paint(); }, handle = N.on('deviceFound', ev => cb(ev.device, ev.progress || .5));
      try {
        const r = await N.call('lanScan', { _cb: cb, ports: [80, 443, 22, 445, 8080, 62078, 5555, 53, 554, 23, 631, 9100, 8008, 1400, 3389] });
        for (const d of r.devices) if (!d.vendor && d.mac) d.vendor = await A.vendor(d.mac);
        devices = r.devices.map(d => ({ ...d, risk: d.ports ? C.riskScore(C.assessPorts(d.ports.map(p => ({ port: p, banner: d.banner })))) : null })); A.ctx.devices = devices;
        sub.textContent = `${devices.length} devices found ${new Date().toLocaleTimeString()}` + (r.macsAvailable === false ? ' | MAC addresses hidden by this Android version' : '');
        devices.forEach(d => { if (!known[devKey(d)] && Object.keys(known).length) A.log({ t: Date.now(), kind: 'newdev', source: 'LAN', sev: 1, msg: `New device ${d.ip} ${d.name || d.vendor || ''}` }); });
        if (!Object.keys(known).length) { devices.forEach(d => known[devKey(d)] = { first: Date.now() }); A.store.set('known', known); A.toast('First scan: all devices marked known. New ones will be flagged.'); }
      } catch (e) { sub.textContent = 'Scan failed: ' + (e.message || e); }
      try { handle && handle.remove && handle.remove(); } catch (e) {}
      scanBtn.disabled = false; scanBtn.textContent = 'Rescan'; prog.classList.add('hide'); paint();
    };
    const wp = A.ctx.wprobes = A.ctx.wprobes || {};
    A.every(5000, async () => { for (const d of devices) { if (!watch.has(devKey(d))) continue; const p = wp[d.ip] || (wp[d.ip] = new C.Probe(d.name || d.ip, d.ip)); try { const r = await N.call('ping', { host: d.ip, count: 1, timeout: 1000 }), v = r.rtts[0]; A.afterAdd(p.add(v, v >= 0)); d.rtt = v; } catch (e) { A.afterAdd(p.add(0, false)); } } paint(); });

    function detail(d) {
      const kind = kindOf(d), k = known[devKey(d)], res = h('div', {}), pbtn = h('button', { class: 'sm' }, 'Scan common ports'), pbtn2 = h('button', { class: 'sm ghost' }, 'Scan ports 1-1024');
      const sh = A.sheet([h('div', { class: 'row' }, h('div', { class: 'ic lg', style: `background:linear-gradient(150deg,${KIND_COL[kind]},color-mix(in srgb,${KIND_COL[kind]} 65%,#000))`, html: Icons.svg(kind) }), h('div', { class: 'grow' }, h('b', { class: 'head', style: 'font-size:18px' }, (k && k.label) || d.name || d.vendor || 'Unknown device'), h('div', { class: 'small mute' }, C.KINDS[kind]), h('div', { class: 'small mute' }, `${d.ip} ${d.mac || ''}`), h('div', { class: 'small mute' }, d.vendor || 'Maker unknown')), h('button', { class: 'sm ghost', onclick: () => sh.close() }, 'Close')),
        kind === 'hub' ? h('div', { class: 'find s0', style: 'margin-top:10px' }, h('b', {}, 'Smart-home hub'), h('div', { class: 'why' }, 'Hubs like this often carry Zigbee or Z-Wave devices. Those use their own radios, which a phone cannot see. Only the hub itself shows up here.')) : null,
        h('div', { class: 'row wrap', style: 'margin:12px 0' },
          h('button', { class: 'sm ghost', onclick: () => { const l = prompt('Name this device', (k && k.label) || d.name || ''); if (l != null) { known[devKey(d)] = { ...(known[devKey(d)] || {}), first: Date.now(), label: l }; A.store.set('known', known); d.kind = null; paint(); } } }, 'Rename'),
          h('button', { class: 'sm ghost', onclick: e => { known[devKey(d)] = { ...(known[devKey(d)] || {}), first: Date.now() }; A.store.set('known', known); paint(); e.target.textContent = 'Marked known'; } }, 'Mark known'),
          h('button', { class: 'sm ghost', onclick: e => { const key = devKey(d); watch.has(key) ? watch.delete(key) : watch.add(key); A.store.set('watch', [...watch]); e.target.textContent = watch.has(key) ? 'Watching (tap to stop)' : 'Watch for drops'; paint(); } }, watch.has(devKey(d)) ? 'Watching (tap to stop)' : 'Watch for drops')),
        h('div', { class: 'row wrap' }, pbtn, adv ? pbtn2 : null), res]);
      async function scan(ports) {
        res.replaceChildren(h('div', { class: 'small mute', style: 'margin-top:10px' }, `Scanning ${ports.length} ports on ${d.ip}...`));
        try { const r = await N.call('portScan', { host: d.ip, ports, timeout: 500 }), f = C.assessPorts(r.open); d.risk = C.riskScore(f); d.ports = r.open.map(o => o.port); d.kind = null; paint();
          res.replaceChildren(h('h3', { style: 'margin:14px 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)' }, `Open ports (${r.open.length})`),
            r.open.length ? h('table', {}, r.open.map(o => h('tr', {}, h('td', {}, o.port), h('td', {}, (C.PORTS[o.port] || ['?'])[0]), h('td', { class: 'small mute' }, (o.banner || '').slice(0, 60))))) : h('div', { class: 'good small' }, 'No open ports found.'),
            h('h3', { style: 'margin:14px 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)' }, `Risk ${d.risk}/100`), f.length ? f.map(x => A.finding({ sev: x.sev, title: x.title, why: x.why })) : h('div', { class: 'good small' }, 'Nothing risky detected.'),
            f.length ? h('div', { class: 'small mute' }, 'Rule-based check of open ports and banners. It never tries passwords or exploits. Treat findings as things to look at.') : null);
        } catch (e) { res.replaceChildren(h('div', { class: 'bad' }, e.message)); }
      }
      pbtn.onclick = () => scan(C.COMMON_PORTS); pbtn2.onclick = () => scan(Array.from({ length: 1024 }, (_, i) => i + 1));
    }
  };

  /* ================= HELP ================= */
  A.views.help = function (root) {
    root.append(A.connBar(), A.card('Which version am I using?', h('div', { class: 'small' }, N.live ? `You are using the ${N.isNative ? 'full Android' : 'Windows'} app, so everything is unlocked.` : 'You are using the limited version, which runs from the website (also when added to your home screen). Speed test, outage check, ping test, fix guide and reports work here. Wi-Fi scanning, finding devices, port scan and trace route are only in the full app, which is Android only.'), N.live ? null : h('button', { class: 'sm', style: 'margin-top:10px', onclick: () => A.howSheet() }, 'Show me the differences')));
    const sel = new Set(A.store.get('symptoms', [])), out = h('div', {});
    root.append(A.card('What is the problem?', h('div', { class: 'small mute', style: 'margin-bottom:10px' }, 'Tap everything that applies. Likely causes are ranked, with the fix and how to confirm it.'),
      h('div', { class: 'chips' }, K.SYMPTOMS.map(([id, label]) => h('span', { class: 'chip' + (sel.has(id) ? ' on' : ''), onclick: e => { const el = e.currentTarget; sel.has(id) ? sel.delete(id) : sel.add(id); el.classList.toggle('on'); A.store.set('symptoms', [...sel]); paint(); } }, label)))), out);
    function paint() {
      const r = K.rank([...sel]);
      out.replaceChildren(r.length ? A.card('Likely causes', r.slice(0, 8).map((x, i) => h('details', { open: i < 2 }, h('summary', {}, x.c.title, h('span', { class: 'pill ' + (x.score >= 4 ? 'bad' : x.score >= 2 ? 'warn' : 'info') }, x.score >= 4 ? 'LIKELY' : x.score >= 2 ? 'POSSIBLE' : 'MAYBE')),
        h('div', { class: 'small mute', style: 'margin:8px 0' }, x.c.why), h('div', { class: 'col small' }, x.c.fix.map(f => h('div', { class: 'row', style: 'align-items:flex-start' }, h('span', { class: 'good' }, '✓'), f))), h('div', { class: 'small info', style: 'margin-top:8px' }, 'Confirm: ' + x.c.test)))) : A.card(null, h('div', { class: 'small mute' }, 'Pick symptoms above to get ranked causes.')));
    }
    paint();
    root.append(A.card('Placement and environment basics', K.BASICS.map(([t, d]) => h('details', {}, h('summary', {}, t), h('div', { class: 'small mute', style: 'margin-top:6px' }, d)))));
    root.append(A.card('Everything that can cause Wi-Fi problems', K.CAUSES.map(c => h('details', {}, h('summary', {}, c.title), h('div', { class: 'small mute', style: 'margin:6px 0' }, c.why), h('div', { class: 'col small' }, c.fix.map(f => h('div', { class: 'row', style: 'align-items:flex-start' }, h('span', { class: 'good' }, '✓'), f)))))));
    // install + settings
    const ta = h('textarea', { rows: 4, style: 'font-size:13px' }, A.targets().map(t => `${t.name}|${t.url}`).join('\n'));
    root.append(A.card('Get the app', A.installPanel()), A.compareCard(), A.modesCard(), A.card('Owner setup: publishing the Android app', h('details', {}, h('summary', {}, 'Android app (APK)'), h('ol', { class: 'small', style: 'margin:8px 0 0 18px;line-height:1.7' }, ['Create a free GitHub account and a new repository.', 'Upload the project files (the full project zip, unzipped).', 'Open the Actions tab, pick Build Android APK, press Run workflow.', 'When it finishes, download the artifact ARC-Signal-apk and unzip it.', 'Rename app-debug.apk to ARC-Signal.apk and upload it to the arcsignal folder on Hostinger next to index.html.', 'The Get the app button then appears for everyone on Android.'].map(s => h('li', {}, s))))));
    root.append(A.card('Settings', h('div', { class: 'small mute' }, 'Theme: tap the round colour button at the top. Mode: Easy / Advanced switch at the top.'), h('label', {}, 'Ping targets (Name|https://url per line)'), ta,
      h('div', { class: 'row wrap', style: 'margin-top:10px' }, h('button', { class: 'sm', onclick: () => { const t = ta.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [n, u] = l.split('|'); return { name: n.trim(), url: (u || '').trim() }; }).filter(t => /^https:\/\//.test(t.url)); if (t.length) { A.store.set('targets', t); A.stopMonitor(); A.startMonitor(); A.toast('Saved'); } else A.toast('Need at least one https:// URL'); } }, 'Save targets'),
        h('button', { class: 'sm ghost', onclick: () => A.report && A.report() }, 'Create report')),
      h('div', { class: 'xs mute', style: 'margin-top:10px' }, 'ARC Signal | ' + N.mode + ' mode')));
  };
})();
