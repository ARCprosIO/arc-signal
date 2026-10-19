/* ARC Signal - Advanced Tools tab */
(function () {
  'use strict';
  const A = window.App, C = window.Core, N = window.Native, Ch = window.Charts, h = A.h;
  const tools = A.tools = {};
  const tc = ms => ms < 20 ? Ch.css('good') : ms < 60 ? Ch.css('warn') : Ch.css('bad');
  const hbars = (rows, lw) => { const mx = Math.max(1, ...rows.map(r => r.value)); return h('div', { class: 'hbars', style: `--lw:${lw || 84}px` }, rows.map(r => h('div', { class: 'hb' }, h('span', { class: 'hbl' }, r.label), h('div', { class: 'bar' }, h('i', { style: `width:${Math.max(3, r.value / mx * 100)}%;background:linear-gradient(90deg,${r.color},color-mix(in srgb,${r.color} 55%,#fff))` })), h('span', { class: 'hbv' }, r.text)))); };
  const meter = (label, val, min, max, lo, hi, unit) => { const pos = v => Math.max(0, Math.min(100, (v - min) / (max - min) * 100)), ok = val >= lo && val <= hi; return h('div', { style: 'margin:14px 0' }, h('div', { class: 'row sp small' }, h('span', {}, label), h('b', { class: ok ? 'good' : 'warn' }, val + ' ' + unit)), h('div', { class: 'meter' }, h('i', { class: 'zone', style: `left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%` }), h('i', { class: 'mk', style: `left:${pos(val)}%;background:${ok ? 'var(--good)' : 'var(--warn)'}` })), h('div', { class: 'row sp xs mute' }, h('span', {}, min), h('span', {}, `ideal ${lo} to ${hi}`), h('span', {}, max))); };
  const GRAD = { Wi: ['#3b82f6', '#8b5cf6'], Net: ['#14b8a6', '#0ea5e9'], PC: ['#0ea5e9', '#6366f1'], Data: ['#f59e0b', '#ec4899'] };
  A.ui = { hbars, meter, tc };
  const sheetHead = (t, sh) => h('div', { class: 'row sp', style: 'margin-bottom:10px' }, h('b', { class: 'head', style: 'font-size:18px' }, t), h('button', { class: 'sm ghost', onclick: () => sh().close() }, 'Close'));
  const need = what => A.lockSheet(what);

  /* Roam walk test */
  tools.roam = function (ssid) {
    if (!N.live) return need('Roam walk test');
    const cv = h('canvas', { style: 'height:200px' }), info = h('div', { class: 'small mute' }, 'Walk slowly through the home. The line changes colour when the phone moves to another access point.'), res = h('div', {}), btn = h('button', {}, 'Start walking'); let pts = [], timer = null, sh;
    sh = A.sheet([sheetHead('Roam walk test', () => sh), cv, info, btn, res]);
    sh._onclose = () => clearInterval(timer);
    btn.onclick = () => {
      if (timer) { clearInterval(timer); timer = null; btn.textContent = 'Start walking'; summary(); return; }
      pts = []; btn.textContent = 'Stop'; res.replaceChildren();
      timer = setInterval(async () => { const w = await A.readWifi(); if (!w || !w.bssid) return; pts.push({ t: Date.now(), rssi: w.rssi, bssid: w.bssid }); Ch.timeline(cv, pts); const r = C.rssiInfo(w.rssi); info.className = 'small ' + r.tone; info.textContent = `${w.rssi} dBm | ${w.bssid} | ${C.bandOf(w.frequency)} ch ${C.channelOf(w.frequency)}`; }, 1000);
    };
    function summary() {
      if (pts.length < 3) return; const roams = []; for (let i = 1; i < pts.length; i++) if (pts[i].bssid !== pts[i - 1].bssid) roams.push({ at: pts[i].t, from: pts[i - 1], to: pts[i] });
      const worst = Math.min(...pts.map(p => p.rssi)), F = [];
      roams.forEach(r => { if (r.from.rssi < -75) F.push({ sev: 1, title: 'Sticky client: roamed late', why: `Held the old AP until ${r.from.rssi} dBm. Enable 802.11k/v/r or lower the node power.` }); });
      if (!roams.length && worst < -72) F.push({ sev: 2, title: 'Signal fell to ' + worst + ' dBm without a roam', why: 'Either no other node reaches here (coverage gap) or the phone is holding on to the far one.' });
      if (roams.length > 4) F.push({ sev: 1, title: 'Many roams (' + roams.length + ')', why: 'Ping-pong between nodes means they overlap at nearly equal strength in this area. Lower power or move a node.' });
      res.replaceChildren(h('div', { class: 'grid', style: 'margin-top:10px' }, A.st(roams.length, 'Roams'), A.st(worst + ' dBm', 'Weakest'), A.st(Math.round(pts.reduce((s, p) => s + p.rssi, 0) / pts.length) + ' dBm', 'Average')), F.length ? F.map(A.finding) : h('div', { class: 'good', style: 'margin-top:10px;font-weight:600' }, 'Clean walk: signal stayed usable and roaming looked healthy.'));
    }
  };

  /* Hunt hot/cold */
  tools.hunt = function (net) {
    if (!N.live) return need('Hunting a Wi-Fi source');
    const big = h('div', { class: 'head', style: 'font-size:64px;font-weight:800;text-align:center;line-height:1' }, '--'), lab = h('div', { style: 'text-align:center;font-weight:700;margin:6px 0' }, 'Searching...'), cv = h('canvas', { style: 'height:120px' }), snd = h('input', { type: 'checkbox', checked: true }), best = h('div', { class: 'small mute', style: 'text-align:center' }); let sh, hist = [], timer, ctx = null, top = -200;
    sh = A.sheet([sheetHead(net.ssid || net.bssid, () => sh), h('div', { class: 'small mute', style: 'text-align:center' }, net.bssid), big, lab, cv, best, h('label', { class: 'row', style: 'justify-content:center;margin-top:10px' }, snd, 'Beep (faster = closer)'), h('div', { class: 'xs mute', style: 'margin-top:10px' }, 'Walk around slowly. Higher number (closer to 0) = closer to the transmitter. Android refreshes scans every few seconds, so move, pause, and watch the trend.')]);
    const beep = f => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = .06; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .08); } catch (e) {} };
    async function tick() { try { const r = await N.call('wifiScan', {}), n = (r.networks || []).find(x => x.bssid === net.bssid); if (!n) { lab.textContent = 'Not heard right now'; return; }
      hist.push(n.level); if (hist.length > 60) hist.shift(); top = Math.max(top, n.level); big.textContent = n.level; const d = hist.length > 3 ? n.level - hist[hist.length - 4] : 0;
      lab.textContent = d > 2 ? 'Getting warmer' : d < -2 ? 'Getting colder' : 'Steady'; lab.className = d > 2 ? 'good' : d < -2 ? 'bad' : 'warn'; best.textContent = `Strongest so far ${top} dBm | about ${Ch.distance(n.level, n.band).toFixed(0)} m`;
      Ch.timeline(cv, hist.map((v, i) => ({ t: i * 1000, rssi: v, bssid: net.bssid }))); if (snd.checked) beep(300 + Math.max(0, n.level + 100) * 14); } catch (e) { lab.textContent = e.message || 'Scan failed'; } }
    tick(); timer = setInterval(tick, 2500); sh._onclose = () => clearInterval(timer);
  };

  /* Room survey */
  tools.survey = function () {
    if (!N.live) return need('Room survey');
    const rooms = A.store.get('rooms', []), list = h('div', {}), inp = h('input', { placeholder: 'Room name, e.g. Kitchen' }); let sh;
    const paint = () => { const tn = { good: Ch.css('good'), warn: Ch.css('warn'), bad: Ch.css('bad') }; const cnt = t => rooms.filter(r => C.rssiInfo(r.rssi).tone === t).length; list.replaceChildren(rooms.length ? [h('div', { style: 'margin:12px 0' }, Ch.donutCard([{ label: 'Strong', value: cnt('good'), color: tn.good }, { label: 'Fair', value: cnt('warn'), color: tn.warn }, { label: 'Weak', value: cnt('bad'), color: tn.bad }], { size: 110, big: rooms.length, small: 'rooms' })), hbars(rooms.map(r => ({ label: r.name, value: C.rssiInfo(r.rssi).pct, color: tn[C.rssiInfo(r.rssi).tone] || tn.warn, text: r.rssi + ' dBm' })), 90), h('div', { class: 'small mute', style: 'margin-top:8px' }, rooms.map(r => `${r.name}: ${r.down != null ? r.down.toFixed(0) + ' Mbps' : '-'}, ${r.ping != null ? Math.round(r.ping) + ' ms' : '-'}`).join('  |  '))] : h('div', { class: 'small mute' }, 'No rooms yet.')); };
    const go = h('button', { onclick: async () => { go.disabled = true; go.textContent = 'Measuring...'; const w = await A.readWifi(); let ping = null, down = null; try { const p = await Speed.pingSeries(6, 100, new AbortController().signal); const ok = p.filter(x => x > 0); ping = ok.length ? ok.reduce((a, b) => a + b) / ok.length : null; } catch (e) {} try { const q = await Speed.quick(3); down = q && q.down; } catch (e) {}
      rooms.push({ name: inp.value || 'Room ' + (rooms.length + 1), rssi: w ? w.rssi : -100, band: w ? C.bandOf(w.frequency) : '', down, ping }); A.store.set('rooms', rooms); inp.value = ''; go.disabled = false; go.textContent = 'Measure this room'; paint(); } }, 'Measure this room');
    sh = A.sheet([sheetHead('Room-by-room survey', () => sh), h('div', { class: 'small mute', style: 'margin-bottom:8px' }, 'Stand in each room, name it, measure. Gives the customer a before and after table.'), inp, go, list, h('button', { class: 'sm ghost', style: 'margin-top:10px', onclick: () => { rooms.length = 0; A.store.set('rooms', []); paint(); } }, 'Clear')]); paint();
  };

  /* Zigbee / Thread / Z-Wave / BLE coexistence */
  tools.zigbee = function () {
    const nets = A.ctx.nets; if (!nets) { A.toast('Scan Wi-Fi first (Wi-Fi tab)'); return; }
    const z = C.zigbee(nets), max = Math.max(1, ...z.channels.map(c => c.load)), cv = h('div', { class: 'zbars' }, z.channels.map(c => h('div', { class: 'zb' }, h('div', { class: 'zbar', style: `height:${Math.max(4, c.load / max * 100)}%;background:linear-gradient(180deg,${c.ch === z.best.ch ? 'var(--good)' : c.load / max > .6 ? 'var(--bad)' : 'var(--acc)'},var(--acc2))` }), h('span', { class: 'xs' }, c.ch)))); let sh;
    sh = A.sheet([sheetHead('Zigbee / Thread coexistence', () => sh), h('div', { class: 'small mute', style: 'margin-bottom:8px' }, 'Your phone cannot hear Zigbee, Thread or Z-Wave (no radio for them). What it can do is show how busy the 2.4 GHz Wi-Fi is over each Zigbee channel, so the Zigbee channel can be placed in a quiet gap.'), cv, h('div', { class: 'find s0', style: 'margin-top:10px' }, h('b', {}, `Best Zigbee channel here: ${z.best.ch}`), h('div', { class: 'why' }, 'Lowest Wi-Fi energy overlapping it in this scan. Zigbee 15, 20, 25 and 26 sit between the common Wi-Fi channels 1, 6 and 11.')),
      h('div', { class: 'col small', style: 'margin-top:12px' }, h('div', {}, h('b', {}, 'Z-Wave: '), 'sub-GHz (908 MHz in the US), so it does not collide with Wi-Fi. Only the hub is visible on the network.'), h('div', {}, h('b', {}, 'Thread / Matter: '), 'same 2.4 GHz band as Zigbee. Use the same channel advice.'), h('div', {}, h('b', {}, 'Bluetooth LE: '), 'hops across 2.4 GHz and tolerates Wi-Fi, but heavy 2.4 GHz traffic still hurts it.'), h('div', {}, h('b', {}, 'Seeing them for real: '), 'needs a USB sniffer dongle (planned as an optional add-on).')) ]);
  };

  /* Custom port scanner */
  tools.ports = function () {
    if (!N.live) return need('Port scanning');
    const host = h('input', { placeholder: 'IP address, e.g. 192.168.1.1', value: (A.ctx.wifi && A.ctx.wifi.gateway) || '' }), pr = h('input', { placeholder: 'Ports, e.g. 22,80,443 or 1-1024', value: '21,22,23,53,80,443,445,554,3389,8080' }), out = h('div', {}); let sh;
    const parse = s => { const set = new Set(); s.split(',').forEach(t => { const m = t.trim().match(/^(\d+)(?:-(\d+))?$/); if (!m) return; const a = +m[1], b = +(m[2] || m[1]); for (let p = a; p <= Math.min(b, a + 5000) && p < 65536; p++) set.add(p); }); return [...set]; };
    const go = h('button', { onclick: async () => { const ports = parse(pr.value); if (!host.value || !ports.length) return A.toast('Enter a host and ports'); go.disabled = true; out.replaceChildren(h('div', { class: 'small mute' }, `Scanning ${ports.length} ports...`));
      try { const r = await N.call('portScan', { host: host.value.trim(), ports, timeout: 500 }), f = C.assessPorts(r.open); const risk = C.riskScore(f); out.replaceChildren(h('div', { class: 'row', style: 'justify-content:center;gap:18px;margin:14px 0' }, Ch.ring(100 - risk, { size: 110, label: 'Safety' }), h('div', {}, A.st(r.open.length, 'Open ports'), h('div', { style: 'height:8px' }), A.st(f.length, 'Findings'))), r.open.length ? h('div', { class: 'chips' }, r.open.map(o => h('span', { class: 'chip' }, h('b', {}, o.port), ' ' + (C.PORTS[o.port] || ['?'])[0]))) : h('div', { class: 'good small' }, 'No open ports.'), f.map(x => A.finding({ sev: x.sev, title: x.title, why: x.why }))); } catch (e) { out.replaceChildren(h('div', { class: 'bad' }, e.message)); } go.disabled = false; } }, 'Scan');
    sh = A.sheet([sheetHead('Port scanner', () => sh), h('label', {}, 'Host'), host, h('label', {}, 'Ports'), pr, go, out]);
  };

  /* Trace route */
  tools.trace = function () {
    if (!N.live) return need('Trace route');
    const host = h('input', { value: '1.1.1.1' }), out = h('div', {}); let sh;
    const go = h('button', { onclick: async () => { go.disabled = true; out.replaceChildren(h('div', { class: 'small mute' }, 'Tracing...')); try { const r = await N.call('traceroute', { host: host.value.trim(), maxHops: 20 }), f = C.analyzeHops(r.hops); out.replaceChildren(h('div', { class: 'small mute', style: 'margin:10px 0 4px' }, 'Delay at each hop (shorter bar is better)'), hbars(r.hops.map(x => ({ label: x.ttl + '  ' + (x.ip || '*'), value: x.rtt > 0 ? x.rtt : 0, color: x.rtt > 0 ? tc(x.rtt) : '#94a3b8', text: x.rtt > 0 ? x.rtt.toFixed(0) + ' ms' : 'no reply' })), 120), f.length ? f.map(A.finding) : h('div', { class: 'good small', style: 'margin-top:8px' }, 'No double NAT or slow first hop found.')); } catch (e) { out.replaceChildren(h('div', { class: 'bad' }, e.message)); } go.disabled = false; } }, 'Trace');
    sh = A.sheet([sheetHead('Trace route', () => sh), host, go, out]);
  };

  /* Modem check */
  tools.modem = function () {
    const f = {}; const fields = [['dsPowerMin', 'Downstream power min (dBmV)'], ['dsPowerMax', 'Downstream power max (dBmV)'], ['dsSnr', 'Downstream SNR min (dB)'], ['usPower', 'Upstream power max (dBmV)'], ['corr', 'Correctable errors'], ['uncorr', 'Uncorrectable errors']]; const out = h('div', {}); let sh;
    sh = A.sheet([sheetHead('Cable modem signal check', () => sh), h('div', { class: 'small mute', style: 'margin-bottom:8px' }, 'Open the modem status page (usually 192.168.100.1), then type in the numbers.'), fields.map(([k, l]) => h('div', {}, h('label', {}, l), h('input', { type: 'number', step: 'any', inputmode: 'decimal', oninput: e => f[k] = e.target.value === '' ? null : +e.target.value }))), h('button', { style: 'margin-top:10px', onclick: () => { const m = [f.dsPowerMin != null ? meter('Downstream power, lowest', f.dsPowerMin, -15, 15, -7, 7, 'dBmV') : null, f.dsPowerMax != null ? meter('Downstream power, highest', f.dsPowerMax, -15, 15, -7, 7, 'dBmV') : null, f.dsSnr != null ? meter('Downstream SNR', f.dsSnr, 20, 50, 35, 50, 'dB') : null, f.usPower != null ? meter('Upstream power', f.usPower, 30, 58, 37, 49, 'dBmV') : null]; out.replaceChildren(h('div', { style: 'margin-top:12px' }, m), ...C.modemCheck(f).map(A.finding)); } }, 'Analyze'), out]);
  };

  /* DNS race (DNS over HTTPS) */
  tools.dns = function () {
    const name = h('input', { value: 'example.com' }), out = h('div', {}); let sh;
    const SRV = [['Cloudflare', 'https://cloudflare-dns.com/dns-query'], ['Google', 'https://dns.google/resolve']];
    const go = h('button', { onclick: async () => { go.disabled = true; out.replaceChildren(h('div', { class: 'small mute' }, 'Racing...')); const rows = [];
      for (const [n, u] of SRV) { const t = []; for (let i = 0; i < 4; i++) { const s = performance.now(); try { await fetch(`${u}?name=${encodeURIComponent(i ? 'x' + i + Date.now() + '.' + name.value : name.value)}&type=A`, { headers: { accept: 'application/dns-json' }, cache: 'no-store' }); t.push(performance.now() - s); } catch (e) { t.push(-1); } } const ok = t.filter(x => x > 0); rows.push([n, ok.length ? Math.min(...ok) : null, ok.length ? ok.reduce((a, b) => a + b) / ok.length : null, t.length - ok.length]); }
      out.replaceChildren(h('div', { class: 'small mute', style: 'margin:10px 0 4px' }, 'Average lookup time (shorter is better)'), hbars(rows.map(r => ({ label: r[0], value: r[2] || 0, color: r[2] == null ? '#94a3b8' : tc(r[2] / 1.5), text: r[2] != null ? Math.round(r[2]) + ' ms' : 'failed' })), 90), h('div', { class: 'small mute', style: 'margin-top:8px' }, 'Measures DNS-over-HTTPS from this phone. Slow lookups (over 100 ms) feel like slow page loads even when speed tests look fine.')); go.disabled = false; } }, 'Run');
    sh = A.sheet([sheetHead('DNS race', () => sh), name, go, out]);
  };

  /* Events / report / CSV */
  tools.events = function () {
    let sh; const ev = A.events.slice().reverse();
    sh = A.sheet([sheetHead('Events', () => sh), h('div', { class: 'row wrap', style: 'margin-bottom:10px' }, h('button', { class: 'sm', onclick: () => A.report() }, 'Create report'), h('button', { class: 'sm ghost', onclick: csv }, 'Download CSV'), h('button', { class: 'sm ghost', onclick: () => { A.events.length = 0; A.store.set('events', []); sh.close(); } }, 'Clear')), ev.length ? ev.slice(0, 200).map(e => h('div', { class: 'small', style: 'padding:5px 0;border-top:1px solid var(--glass-line)' }, h('span', { class: 'mute' }, new Date(e.t).toLocaleString() + '  '), h('span', { class: A.tone(e.sev) }, e.msg))) : h('div', { class: 'small mute' }, 'No events yet. Run the Live monitor.')]);
  };
  function csv() { const rows = [['time', 'severity', 'source', 'message'], ...A.events.map(e => [new Date(e.t).toISOString(), e.sev, e.source || '', '"' + String(e.msg).replace(/"/g, '""') + '"'])]; dl('arc-signal-events.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv'); }
  function dl(name, text, type) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); setTimeout(() => a.remove(), 500); }
  A.report = function () {
    const v = A.verdict(), w = A.ctx.wifi, rows = A.probes.map(p => p.snap()), esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<!doctype html><meta charset=utf-8><title>ARC Signal Report</title><style>body{font:15px Inter,system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1b2430}h1{margin:0}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #dde3ec;padding:6px;text-align:left}.b{color:#c0392b}.w{color:#b9770e}.g{color:#1e8449}</style><h1>ARC Signal report</h1><p>${new Date().toLocaleString()} | AR Consulting Pros</p><h2>Verdict</h2><p><b>${esc(v.title)}</b><br>${esc(v.detail || '')}</p>${w ? `<h2>Wi-Fi</h2><p>${esc(w.ssid || '')} | ${w.rssi} dBm | ${C.bandOf(w.frequency)} ch ${C.channelOf(w.frequency)}</p>` : ''}<h2>Latency</h2><table><tr><th>Target<th>Avg<th>Jitter<th>Loss</tr>${rows.map(r => `<tr><td>${esc(r.name)}<td>${r.avg != null ? Math.round(r.avg) : '-'} ms<td>${r.jitter != null ? r.jitter.toFixed(1) : '-'} ms<td>${(r.loss || 0).toFixed(1)}%</tr>`).join('')}</table><h2>Findings</h2>${(A.ctx.findings || []).map(f => `<p class="${f.sev >= 2 ? 'b' : f.sev ? 'w' : 'g'}"><b>${esc(f.title)}</b><br>${esc(f.why || '')}</p>`).join('') || '<p>None.</p>'}<h2>Recent events</h2>${A.events.slice(-30).reverse().map(e => `<div>${new Date(e.t).toLocaleTimeString()} ${esc(e.msg)}</div>`).join('')}`;
    dl('arc-signal-report.html', html, 'text/html');
  };

  /* RF reference */
  tools.ref = function () {
    let sh; const T = [['2.4 GHz', 'Reaches far, passes walls, but only 3 clean channels (1, 6, 11) and shared with microwaves, Bluetooth, Zigbee, baby monitors.'], ['5 GHz', 'Much faster, more channels, shorter range. DFS channels (52-144) can drop when radar is detected.'], ['6 GHz', 'Wi-Fi 6E / 7 only. Very clean and fast, shortest range, needs 6E-capable devices. Best for same-room, high-demand gear.'], ['-50 dBm or better', 'Excellent'], ['-67 dBm', 'Minimum for video and calls'], ['-70 dBm', 'Fair; expect slowdowns'], ['-80 dBm or worse', 'Unreliable'], ['20 / 40 / 80 / 160 MHz', 'Wider = faster but fewer clean channels. Use 20 MHz on crowded 2.4 GHz, 80 on 5 GHz.'], ['Mesh placement', 'Place nodes about 1 room of overlap apart, with each node seeing the main router at -60 dBm or better. Wired backhaul beats wireless.'], ['Stacked routers', 'Two routers doing NAT cause double NAT and fighting Wi-Fi. Put the second in bridge/AP mode and give it a different channel.']];
    sh = A.sheet([sheetHead('RF reference', () => sh), T.map(([a, b]) => h('div', { style: 'padding:9px 0;border-top:1px solid var(--glass-line)' }, h('b', {}, a), h('div', { class: 'small mute' }, b)))]);
  };

  /* Tools tab */
  const TILES = [['radar', 'Radar locator', 'Find and track nearby APs', () => A.go('wifi', 'radar'), 'Wi', 'Wi-Fi tools', 'Channels, mesh, rogue'], ['mesh', 'Mesh analyzer', 'Nodes, overlap, channel plan', () => A.go('wifi', 'mesh'), 'Wi'], ['walk', 'Roam walk test', 'Does the phone hop nodes cleanly', () => tools.roam(A.ctx.wifi && A.ctx.wifi.ssid), 'Wi'], ['shield', 'Rogue scan', 'Evil twins, hidden, fakes', () => A.go('wifi', 'rogue'), 'Wi'], ['check', 'Room survey', 'Signal and speed per room', () => tools.survey(), 'Wi'], ['zigbee', 'Zigbee / Thread', 'Coexistence advisor', () => tools.zigbee(), 'Wi'],
    ['port', 'Port scanner', 'Any host, any range', () => tools.ports(), 'Net', 'Network tools', 'Hosts, routes, DNS, modem'], ['trace', 'Trace route', 'Hops and double NAT', () => tools.trace(), 'Net'], ['dns', 'DNS race', 'Resolver speed', () => tools.dns(), 'Net'], ['modem', 'Cable modem check', 'Power, SNR, errors', () => tools.modem(), 'Net'],
    ['bolt', 'Events log', 'History and CSV', () => tools.events(), 'Data', 'Data and reports', 'History, exports, reference'], ['report', 'Report', 'Shareable HTML report', () => A.report(), 'Data'], ['book', 'RF reference', 'Cheat sheet', () => tools.ref(), 'Data']];
  A.TILES = TILES;
  A.tile = (ic, title, desc, fn, grad, locked) => h('button', { class: 'tile' + (locked ? ' locked' : ''), onclick: fn }, locked ? h('span', { class: 'lockpill' }, 'APP') : null, h('div', { class: 'ic sm', style: `background:linear-gradient(150deg,${grad[0]},${grad[1]})`, html: Icons.svg(ic) }), h('b', {}, title), h('span', { class: 'small mute' }, desc));
  const NEEDS_LIVE = new Set(['Roam walk test', 'Room survey', 'Port scanner', 'Trace route']);
  A.views.tools = function (root) {
    root.append(A.connBar());
    const v = A.verdict(), sp = A.ctx.lastSpeed || A.store.get('speedhist', [])[0], hs = C.healthScore({ verdictSev: v[1], rssi: A.ctx.wifi && A.ctx.wifi.rssi, bloat: sp && sp.bloat, down: sp && sp.down });
    const ev = A.events.slice(-100), cnt = s => ev.filter(e => e.sev === s).length;
    root.append(h('div', { class: 'grid2' }, A.card('Health', Ch.ring(v[0] === 'Collecting data...' ? 0 : hs.score, { size: 120, label: 'now' })), A.card('Recent events', Ch.donutCard([{ label: 'Info', value: cnt(0), color: Ch.css('good') }, { label: 'Warning', value: cnt(1), color: Ch.css('warn') }, { label: 'Problem', value: cnt(2), color: Ch.css('bad') }], { size: 110, big: ev.length, small: 'logged' }))),
      sp ? A.card('Last speed test', h('div', { class: 'grid' }, A.st(C.fmt.mbps(sp.down), 'Down Mbps'), A.st(C.fmt.mbps(sp.up), 'Up Mbps'), A.st(C.fmt.ms(sp.idle), 'Idle delay'), A.st(Math.round(sp.bloat || 0) + ' ms', 'Extra under load'))) : null);
    ['Wi', 'Net', 'PC', 'Data'].filter(g => g !== 'PC' || N.isDesktop).forEach(g => { const head = TILES.find(t => t[4] === g && t[5]), g2 = GRAD[g];
      root.append(h('div', { class: 'card', style: 'padding:0;overflow:hidden' }, h('div', { style: `padding:14px 16px;color:#fff;background:linear-gradient(135deg,${g2[0]},${g2[1]})` }, h('b', { class: 'head', style: 'font-size:17px' }, head[5]), h('div', { style: 'font-size:12.5px;opacity:.9' }, head[6])),
        h('div', { class: 'tiles', style: 'padding:12px' }, TILES.filter(t => t[4] === g).map(t => A.tile(t[0], t[1], t[2], t[3], g2, (NEEDS_LIVE.has(t[1]) && !N.live) || false))))); });
  };
})();
