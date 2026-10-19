/* ARC Signal - framework: modes, themes, tabs, monitor engine, Home / Live / Speed views */
(function () {
  'use strict';
  const C = window.Core, N = window.Native, Ch = window.Charts;
  const A = window.App = { views: {}, tab: 'home', timers: [], probes: [], events: [], ctx: {}, mode: 'easy' };

  /* ---------- helpers ---------- */
  A.$ = (s, el) => (el || document).querySelector(s);
  A.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat(9)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const h = A.h;
  const _ap = Element.prototype.append; Element.prototype.append = function (...k) { return _ap.apply(this, k.flat(9).filter(x => x != null && x !== false).map(x => x.nodeType ? x : document.createTextNode(String(x)))); };
  const _rc = Element.prototype.replaceChildren;
  Element.prototype.replaceChildren = function (...k) { return _rc.apply(this, k.flat(9).filter(x => x != null && x !== false).map(x => x.nodeType ? x : document.createTextNode(String(x)))); };
  A.store = {
    get(k, d) { try { const v = localStorage.getItem('nd_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('nd_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  A.toast = msg => { const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), 2800); };
  A.sleep = ms => new Promise(r => setTimeout(r, ms));
  A.tone = s => s === 0 ? 'good' : s === 1 ? 'warn' : 'bad';
  A.sheet = function (content) {
    const s = h('div', { class: 'sheet', onclick: e => { if (e.target === s) A.closeSheet(s); } }, h('div', {}, content));
    document.body.append(s); s.close = () => A.closeSheet(s); return s;
  };
  A.closeSheet = s => { if (s._onclose) s._onclose(); s.remove(); };
  A.finding = f => h('div', { class: 'find s' + f.sev }, h('b', {}, f.title), f.why && h('div', { class: 'why' }, f.why), f.fix && h('div', { class: 'fix' }, 'Fix: ' + f.fix));
  A.every = (ms, fn) => { const id = setInterval(fn, ms); A.timers.push(id); return id; };
  A.clearTimers = () => { A.timers.forEach(clearInterval); A.timers = []; (A.cleanups || []).forEach(f => { try { f(); } catch (e) {} }); A.cleanups = []; };
  A.cleanup = fn => { (A.cleanups = A.cleanups || []).push(fn); };
  A.icon = (n, cls) => Icons.el(n, cls);
  A.st = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));
  A.card = (title, ...kids) => h('div', { class: 'card' }, title ? h('h2', {}, title) : null, ...kids);
  A.adv = () => A.mode === 'adv';

  /* ---------- MAC vendor lookup (IEEE OUI list) ---------- */
  let ouiP = null;
  A.vendor = async function (mac) {
    if (!mac) return '';
    const hex = mac.replace(/[:\-]/g, '').toUpperCase(); if (hex.length < 6) return '';
    if (parseInt(hex.slice(0, 2), 16) & 2) return '(private/random MAC)';
    if (!ouiP) ouiP = (async () => { const m = new Map(); try { const r = await fetch('data/oui.gz'); const t = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text(); for (const l of t.split('\n')) if (l[6] === '\t') m.set(l.slice(0, 6), l.slice(7)); } catch (e) {} return m; })();
    return (await ouiP).get(hex.slice(0, 6)) || '';
  };

  /* ---------- events ---------- */
  A.events = A.store.get('events', []);
  A.log = function (e) { A.events.push(e); if (A.events.length > 600) A.events.shift(); A.store.set('events', A.events); if (e.sev >= 2) { A.toast(e.msg); try { if (N.isDesktop && window.Notification) { if (Notification.permission === 'default') Notification.requestPermission(); if (Notification.permission === 'granted') new Notification('ARC Signal', { body: e.msg }); } } catch (x) {} } };

  /* ---------- sparkline ---------- */
  A.spark = function (cv, hist, opt) {
    opt = opt || {}; const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, hgt = cv.clientHeight;
    if (!w) return; cv.width = w * dpr; cv.height = hgt * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, hgt);
    const acc = Ch.css('acc'), acc2 = Ch.css('acc2'), bad = Ch.css('bad'), line = Ch.css('glass-line');
    const vals = hist.filter(v => v > 0); const mx = Math.max(opt.min || 20, ...(vals.length ? vals : [0])) * 1.15;
    g.strokeStyle = line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, hgt - .5); g.lineTo(w, hgt - .5); g.stroke();
    const step = w / (hist.length - 1), pts = [];
    hist.forEach((v, i) => pts.push(v > 0 ? [i * step, hgt - 3 - (v / mx) * (hgt - 8)] : null));
    const grad = g.createLinearGradient(0, 0, 0, hgt); grad.addColorStop(0, acc2 + '66'); grad.addColorStop(1, acc2 + '00');
    let run = []; const flush = () => { if (run.length > 1) { g.beginPath(); g.moveTo(run[0][0], hgt); run.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(run[run.length - 1][0], hgt); g.closePath(); g.fillStyle = grad; g.fill();
      g.beginPath(); run.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.strokeStyle = acc; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); } run = []; };
    pts.forEach(p => { if (p) run.push(p); else flush(); }); flush();
    g.fillStyle = bad; hist.forEach((v, i) => { if (v < 0) g.fillRect(i * step - 1, 0, 2.5, hgt); });
  };

  /* ---------- monitoring engine ---------- */
  const DEFAULT_TARGETS = [
    { name: 'Cloudflare', url: 'https://cp.cloudflare.com/generate_204' },
    { name: 'Google', url: 'https://www.google.com/generate_204' },
    { name: '1.1.1.1', url: 'https://1.1.1.1/cdn-cgi/trace' }
  ];
  A.targets = () => A.store.get('targets', null) || DEFAULT_TARGETS;
  A.monitorOn = false;
  async function webPing(url) {
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 3000), t = performance.now();
    try { await fetch(url + (url.includes('?') ? '&' : '?') + 'r=' + Math.random().toString(36).slice(2), { mode: 'no-cors', cache: 'no-store', signal: ac.signal }); return [performance.now() - t, true]; }
    catch (e) { return [0, false]; } finally { clearTimeout(to); }
  }
  A.startMonitor = async function () {
    if (A.monitorOn) return; A.monitorOn = true;
    A.probes = A.targets().map(t => new C.Probe(t.name, t.url)); A.gwProbe = null;
    if (N.live) { try { const li = await N.call('lanInfo'); if (li.gateway) { A.gwProbe = new C.Probe('Router', li.gateway); A.ctx.lan = li; } } catch (e) {} }
    try { if (N.isNative || N.isDesktop) await N.call('keepAwake', { on: true }); else if (navigator.wakeLock) A.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    A.monTimer = setInterval(async () => {
      const jobs = A.probes.map(async p => { const [rtt, ok] = await webPing(p.target); A.afterAdd(p.add(rtt, ok)); });
      if (A.gwProbe) jobs.push((async () => { try { const r = await N.call('ping', { host: A.gwProbe.target, count: 1, timeout: 1000 }); const v = r.rtts[0]; A.afterAdd(A.gwProbe.add(v, v >= 0)); } catch (e) { A.afterAdd(A.gwProbe.add(0, false)); } })());
      await Promise.all(jobs); if (A.liveUpd) A.liveUpd();
    }, 1000);
  };
  A.afterAdd = evs => evs.forEach(A.log);
  A.stopMonitor = function () { A.monitorOn = false; clearInterval(A.monTimer); try { A.wake && A.wake.release(); } catch (e) {} if (N.isNative || N.isDesktop) N.call('keepAwake', { on: false }).catch(() => {}); };
  A.verdict = () => C.diagnose(A.gwProbe ? A.gwProbe.snap() : null, A.probes.map(p => p.snap()), !!(A.ctx.wifi && A.ctx.wifi.ssid));

  /* ---------- Wi-Fi scan (shared by every Wi-Fi view) ---------- */
  A.readWifi = async function () { if (!N.live) return null; try { A.ctx.wifi = await N.call('wifiInfo'); } catch (e) { A.ctx.wifi = null; } return A.ctx.wifi; };
  A.scan = async function () {
    const r = await N.call('wifiScan');
    const nets = r.networks.map(n => ({ ...n, bssid: (n.bssid || '').toLowerCase(), channel: C.channelOf(n.frequency), band: C.bandOf(n.frequency), center: n.center || n.frequency })).filter(n => n.bssid);
    nets.sort((a, b) => b.level - a.level);
    const vendors = {}; await Promise.all(nets.map(async n => { vendors[n.bssid] = await A.vendor(n.bssid); }));
    Object.assign(A.ctx, { nets, vendors, scanAt: Date.now(), throttled: r.throttled });
    const info = A.ctx.wifi || await A.readWifi(), mine = info && info.bssid;
    A.ctx.rogue = C.rogueScan(nets, mine, vendors);
    A.ctx.findings = C.analyzeWifi(nets, mine).filter(f => f.tag !== 'rogue');
    return nets;
  };

  /* ---------- header: mode switch + theme popover ---------- */
  function buildHeader() {
    const hdr = A.$('#hdr'); hdr.replaceChildren();
    const segEasy = h('button', { onclick: () => A.setMode('easy') }, 'Easy'), segAdv = h('button', { onclick: () => A.setMode('adv') }, 'Advanced');
    A.segs = { easy: segEasy, adv: segAdv };
    const tb = h('button', { class: 'themebtn', title: 'Theme', 'aria-label': 'Change theme', onclick: e => { e.stopPropagation(); themePop(); } });
    hdr.append(h('div', { class: 'brand', html: '<svg class="logo" viewBox="0 0 32 32" fill="none" stroke-linecap="round"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--acc2)"/><stop offset="1" stop-color="var(--acc)"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="url(#lg)"/><path d="M6 13a14 14 0 0 1 20 0M10 17.5a8.5 8.5 0 0 1 12 0M14 22a3 3 0 0 1 4 0" stroke="var(--on-acc)" stroke-width="2.4"/><circle cx="16" cy="26" r="1.5" fill="var(--on-acc)"/></svg><h1>ARC <b>Signal</b></h1>' }),
      h('div', { class: 'hdr-r' }, h('div', { class: 'seg' }, segEasy, segAdv), tb));
    paintSeg();
  }
  function paintSeg() { A.segs.easy.classList.toggle('on', A.mode === 'easy'); A.segs.adv.classList.toggle('on', A.mode === 'adv'); }
  function themePop() {
    const ex = A.$('.pop'); if (ex) { ex.remove(); return; }
    const cur = Themes.current(), pop = h('div', { class: 'pop' }, h('h4', {}, 'Colour theme'),
      Object.entries(Themes.T).map(([id, t]) => h('button', { class: 'opt' + (id === cur ? ' on' : ''), onclick: () => { Themes.apply(id); pop.remove(); } },
        h('span', { class: 'sw', style: `background:linear-gradient(135deg,${t.v.acc2},${t.v.acc} 55%,${t.v.g1})` }), t.name, id === cur ? h('span', { class: 'chk', html: Icons.svg('check', 'width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6"') }) : null)));
    document.body.append(pop);
    setTimeout(() => document.addEventListener('click', function f(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', f); } }), 0);
  }
  A.setMode = function (m) { A.mode = m; A.store.set('mode', m); paintSeg(); buildTabs(); const t = TABS()[A.tab] ? A.tab : (m === 'adv' ? 'live' : 'home'); A.go(t); };

  /* ---------- tabs ---------- */
  const ICON = { home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>', live: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', speed: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>', wifi: Icons.P.wifi, devices: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>' };
  const TABS = () => A.adv() ? { live: 'Live', speed: 'Speed', wifi: 'Wi-Fi', devices: 'Devices', tools: 'Tools', help: 'Help' } : { home: 'Home', speed: 'Speed', wifi: 'Wi-Fi', devices: 'Devices', help: 'Help' };
  function buildTabs() { const nav = A.$('#tabs'); nav.replaceChildren(); Object.entries(TABS()).forEach(([id, label]) => nav.append(h('button', { 'data-t': id, onclick: () => A.go(id), html: `<svg viewBox="0 0 24 24">${ICON[id]}</svg><span>${label}</span>` }))); }
  A.go = function (id, arg) {
    A.clearTimers(); A.liveUpd = null; A.tab = id; A.store.set('tab', id);
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
    const v = A.$('#view'); v.replaceChildren(); window.scrollTo(0, 0); A.views[id](v, arg);
  };
  A.boot = function () {
    A.mode = A.store.get('mode', 'easy'); buildHeader(); buildTabs();
    const m = A.$('#mode'); if (m) m.remove();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); A.installEvt = e; });
    document.addEventListener('themechange', () => { Ch.resetColors && 0; if (A.views[A.tab]) A.go(A.tab); });
    (async () => { if (N.isNative) { try { await window.Capacitor.Plugins.NetScan.requestPermissions(); } catch (e) {} } A.startMonitor(); await A.readWifi(); })();
    const t = A.store.get('tab', null); A.go(TABS()[t] ? t : (A.adv() ? 'live' : 'home'));
  };

  /* ================= HOME (easy) ================= */
  A.views.home = function (root) {
    const hero = A.card(null), todo = A.card('What to do next'), pings = A.card('Internet connection');
    root.append(A.connBar(), hero);
    root.append(h('div', { class: 'tiles', style: 'margin-bottom:14px' }, A.tile('speed', 'Speed test', 'Speed and lag under load', () => A.go('speed'), ['#3b82f6', '#06b6d4']), A.tile('globe', 'Outage check', 'Is it them or me?', () => A.go('outage'), ['#ef4444', '#f97316']), A.tile('wifi', 'Wi-Fi', N.live ? 'Scan and see channels' : 'Load a scan from your PC', () => A.go('wifi'), ['#8b5cf6', '#ec4899']), A.tile('devices', 'Devices', 'Everything on your network', () => A.go('devices'), ['#10b981', '#14b8a6'], !N.live), A.tile('trace', 'Ping test', 'Latency graph and loss', () => A.tools.ping(), ['#14b8a6', '#0ea5e9']), A.tile('book', 'Fix a problem', 'Pick symptoms, get answers', () => A.go('help'), ['#f59e0b', '#ef4444'])));
    root.append(A.readinessCard()); { const ib = A.installBanner && A.installBanner(); if (ib) root.append(ib); }
    root.append(todo, pings);
    async function paint() {
      const wifi = A.ctx.wifi, v = A.verdict(), sp = A.ctx.lastSpeed || A.store.get('speedhist', [])[0];
      const hs = C.healthScore({ verdictSev: v[1], rssi: wifi && wifi.rssi, bloat: sp && sp.bloat, down: sp && sp.down });
      const snaps = A.probes.map(p => p.snap()), avg = snaps.filter(s => s.avg).map(s => s.avg), ms = avg.length ? avg.reduce((a, b) => a + b) / avg.length : null;
      const sig = wifi && wifi.rssi != null ? C.rssiInfo(wifi.rssi) : null;
      const ready = v[0] !== 'Collecting data...';
      hero.replaceChildren(h('div', { class: 'row wrap', style: 'justify-content:center;gap:18px' },
        Ch.ring(ready ? hs.score : 0, { size: 170, label: ready ? (hs.score >= 75 ? 'Healthy' : hs.score >= 50 ? 'Needs attention' : 'Problem') : 'Checking...' }),
        h('div', { class: 'grow', style: 'min-width:200px' }, h('div', { class: 'head', style: 'font-size:19px;font-weight:800;margin-bottom:6px' }, ready ? v[0] : 'Checking your connection...'),
          h('div', { class: 'grid', style: 'grid-template-columns:repeat(3,1fr)' }, A.st(sig ? sig.label : '-', 'Wi-Fi signal'), A.st(sp ? C.fmt.mbps(sp.down) : '-', 'Mbps down'), A.st(ms ? Math.round(ms) : '-', 'ms delay')),
          h('div', { class: 'row wrap', style: 'margin-top:12px' }, h('button', { onclick: () => A.go('speed') }, 'Test my speed'), N.live ? h('button', { class: 'ghost', onclick: () => A.go('wifi') }, 'Check Wi-Fi') : null))));
      const items = [];
      if (v[1] > 0) items.push({ sev: v[1], title: v[0], why: 'Based on the live checks below.', fix: v[1] === 2 ? 'Move closer to the router and restart it. If it keeps happening, run the Fix guide.' : 'Try a speed test, then open Help to see likely causes.' });
      if (sig && sig.tone !== 'good') items.push({ sev: sig.tone === 'warn' ? 1 : 2, title: `Wi-Fi signal is ${sig.label.toLowerCase()} here (${wifi.rssi} dBm)`, why: sig.note, fix: 'Move the router closer or add a node between here and the router.' });
      if (sp && sp.bloat > 60) items.push({ sev: 1, title: 'Calls and games may lag when the internet is busy', why: C.bloatText(sp.bloat), fix: 'Turn on SQM / QoS in the router.' });
      if (N.live && A.ctx.findings) A.ctx.findings.slice(0, 2).forEach(f => items.push(f));
      if (A.ctx.rogue && A.ctx.rogue.findings.length) items.push(A.ctx.rogue.findings[0]);
      todo.replaceChildren(h('h2', {}, 'What to do next'), items.length ? items.slice(0, 4).map(A.finding) : h('div', { class: 'good', style: 'font-weight:600' }, ready ? 'Everything looks good. Nothing to fix right now.' : 'Gathering data...'));
      pings.replaceChildren(h('h2', {}, 'Internet connection'), snaps.map(s => { const q = C.quality(s); return h('div', { class: 'row sp', style: 'padding:6px 0' }, h('span', { style: 'font-weight:600' }, s.name), h('span', { class: 'row', style: 'gap:10px' }, h('span', { class: 'xs mute' }, s.avg ? Math.round(s.avg) + ' ms' : '...'), h('span', { class: 'pill ' + (q === 'Good' ? 'good' : q === 'Fair' ? 'warn' : q === 'Poor' ? 'bad' : '') }, q))); }));
    }
    paint(); A.every(2000, paint);
    if (N.live && !A.ctx.nets) A.scan().then(paint).catch(() => {});
  };

  /* ================= LIVE (advanced) ================= */
  A.views.live = function (root) {
    const verdict = h('div', { class: 'card verdict t0' }, 'Collecting data...');
    const conn = A.card('Connection'), cards = h('div', {}), mix = A.card('Latency mix');
    root.append(verdict, conn, cards, mix);
    const cardMap = new Map(), evBox = A.card('Recent events');
    root.append(h('div', { class: 'row wrap', style: 'margin-bottom:14px' },
      h('button', { class: 'sm ghost', onclick: e => { if (A.monitorOn) { A.stopMonitor(); e.target.textContent = 'Resume'; } else { A.startMonitor(); e.target.textContent = 'Pause'; } } }, A.monitorOn ? 'Pause' : 'Resume'),
      h('button', { class: 'sm ghost', onclick: () => { A.probes.forEach(p => p.reset()); if (A.gwProbe) A.gwProbe.reset(); cards.replaceChildren(); cardMap.clear(); } }, 'Reset stats'),
      h('span', { class: 'small mute grow' }, 'Pings every second. Screen stays awake while monitoring.')), evBox);
    const info = navigator.connection;
    function drawConn() {
      const wifi = A.ctx.wifi, kids = [h('h2', {}, 'Connection')];
      if (wifi && wifi.ssid) {
        const r = C.rssiInfo(wifi.rssi);
        kids.push(h('div', { class: 'row sp' }, h('div', { class: 'grow' }, h('div', { class: 'head', style: 'font-weight:800;font-size:18px' }, wifi.ssid), h('div', { class: 'small mute' }, `${C.bandOf(wifi.frequency)} ch ${C.channelOf(wifi.frequency)} | ${wifi.standard || ''} | ${wifi.linkSpeed || '?'} Mbps link`)),
          h('div', { style: 'text-align:right' }, h('div', { class: 'head ' + r.tone, style: 'font-size:24px;font-weight:800' }, wifi.rssi + ' dBm'), h('div', { class: 'small ' + r.tone }, r.label))));
        kids.push(h('div', { class: 'bar', style: 'margin-top:8px' }, h('i', { style: `width:${r.pct}%` })), h('div', { class: 'small mute', style: 'margin-top:6px' }, r.note));
      } else if (info) {
        kids.push(h('div', { class: 'grid' }, A.st((info.effectiveType || '?').toUpperCase(), 'Browser estimate'), A.st(info.downlink != null ? info.downlink + ' Mbps' : '-', 'Est. downlink'), A.st(info.rtt != null ? info.rtt + ' ms' : '-', 'Est. RTT')),
          h('div', { class: 'small mute', style: 'margin-top:8px' }, 'Browsers hide Wi-Fi signal and router details. The Android app shows signal, channel, link speed and pings your router.'));
      } else kids.push(h('div', { class: 'small mute' }, 'Connection details are only available in the Android app.'));
      conn.replaceChildren(...kids);
    }
    A.readWifi().then(drawConn); A.every(3000, () => A.readWifi().then(drawConn)); drawConn();
    A.liveUpd = function () {
      const all = (A.gwProbe ? [A.gwProbe] : []).concat(A.probes), snaps = all.map(p => p.snap());
      for (const s of snaps) {
        let c = cardMap.get(s.name);
        if (!c) { c = { el: h('div', { class: 'card probe' }), cv: h('canvas', { style: 'height:54px' }), top: h('div', { class: 'row sp' }), st: h('div', { class: 'small mute', style: 'margin-top:6px' }) }; c.el.append(c.top, c.cv, c.st); cards.append(c.el); cardMap.set(s.name, c); }
        const q = C.quality(s), qt = q === 'Good' ? 'good' : q === 'Fair' ? 'warn' : q === 'Poor' ? 'bad' : '';
        c.top.replaceChildren(h('div', {}, h('div', { class: 'name' }, s.name), h('div', { class: 'small mute' }, s.name === 'Router' ? s.target : s.target.replace(/^https?:\/\//, '').split('/')[0])),
          h('div', { style: 'text-align:right' }, h('div', { class: 'big' }, s.last > 0 ? C.fmt.ms(s.last) : (s.sent ? 'lost' : '...')), h('span', { class: 'pill ' + qt }, q)));
        A.spark(c.cv, s.hist);
        c.st.textContent = `avg ${s.avg ? C.fmt.ms(s.avg) : '-'}  |  jitter ${s.jitter.toFixed(1)}  |  loss ${s.lossPct.toFixed(1)}%  |  ${s.min === Infinity ? '-' : Math.round(s.min)}-${Math.round(s.max)} ms  |  n=${s.sent}`;
      }
      const [text, sev] = A.verdict(); verdict.className = 'card verdict t' + sev; verdict.replaceChildren(h('span', { class: 'pulse' }), text);
      // latency mix donut
      const vals = snaps.flatMap(s => s.hist), tot = vals.filter(v => v !== 0);
      const B = [['Under 20 ms', v => v > 0 && v <= 20, Ch.css('good')], ['20-50 ms', v => v > 20 && v <= 50, Ch.css('acc')], ['50-100 ms', v => v > 50 && v <= 100, Ch.css('info')], ['100-200 ms', v => v > 100 && v <= 200, Ch.css('warn')], ['Over 200 ms', v => v > 200, '#fb923c'], ['Lost', v => v < 0, Ch.css('bad')]];
      const data = B.map(([label, f, color]) => ({ label, color, value: tot.filter(f).length }));
      mix.replaceChildren(h('h2', {}, 'Latency mix (last 90 s, all targets)'), tot.length ? Ch.donutCard(data, { size: 160, big: tot.length, small: 'samples' }) : h('div', { class: 'small mute' }, 'Collecting...'));
      const ev = A.events.slice(-6).reverse();
      evBox.replaceChildren(h('h2', {}, 'Recent events'), ev.length ? ev.map(e => h('div', { class: 'small', style: 'padding:4px 0' }, h('span', { class: 'mute' }, new Date(e.t).toLocaleTimeString() + '  '), h('span', { class: A.tone(e.sev) }, e.msg))) : h('div', { class: 'small mute' }, 'Nothing yet. Drops, spikes and recoveries are logged here and under Tools > Events.'));
    };
    A.liveUpd();
  };

  /* ================= SPEED ================= */
  A.views.speed = function (root) {
    const cv = h('canvas', { style: 'height:220px' }), phase = h('div', { class: 'small mute', style: 'text-align:center' }, 'Ready'), btn = h('button', { style: 'width:100%;margin-top:12px;min-height:50px;font-size:16px' }, 'Start speed test'), res = h('div', {});
    const spCv = h('canvas', { style: 'height:150px' }), ltCv = h('canvas', { style: 'height:120px' }), spStats = h('div', { class: 'grid', style: 'margin-top:10px' }), chartCard = A.card('Speed over time', spCv, spStats, h('h2', { style: 'margin-top:16px' }, 'Delay during the test'), ltCv, h('div', { class: 'xs mute', style: 'margin-top:4px' }, 'Dashed line = your normal (idle) delay. If the colored line climbs far above it while the speed is running, that is where lag comes from.'));
    root.append(A.card(null, cv, phase, btn), chartCard, res);
    let ds = [], us = [], dlLen = 8;
    function lineChart(c, lines, o) {
      const dpr = window.devicePixelRatio || 1, w = c.clientWidth, hh = c.clientHeight; if (!w) return; c.width = w * dpr; c.height = hh * dpr;
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
      const L = 38, T = 8, B = 18, pw = w - L - 8, ph = hh - T - B, all = lines.flatMap(l => l.pts.map(p => p.y)), raw = Math.max(o.min || 10, ...all, o.base || 0);
      const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }, ymax = nice(raw * 1.05), X = t => L + t / o.xmax * pw, Y = v => T + (1 - v / ymax) * ph;
      g.font = '10.5px Inter,sans-serif'; g.textAlign = 'right'; g.fillStyle = Ch.css('mute'); g.strokeStyle = Ch.css('glass-line'); g.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const v = ymax * i / 4; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(w - 8, Y(v)); g.stroke(); g.fillText(v >= 10 ? Math.round(v) : v.toFixed(1), L - 5, Y(v) + 4); }
      if (o.split) { g.setLineDash([3, 4]); g.beginPath(); g.moveTo(X(o.split), T); g.lineTo(X(o.split), T + ph); g.stroke(); g.setLineDash([]); g.textAlign = 'center'; g.fillText('Download', X(o.split / 2), hh - 4); g.fillText('Upload', X((o.split + o.xmax) / 2), hh - 4); }
      if (o.base) { g.strokeStyle = Ch.css('good'); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(L, Y(o.base)); g.lineTo(w - 8, Y(o.base)); g.stroke(); g.setLineDash([]); }
      lines.forEach(l => { if (l.pts.length < 2) return; const gr = g.createLinearGradient(0, T, 0, T + ph); gr.addColorStop(0, l.color + '55'); gr.addColorStop(1, l.color + '00');
        g.beginPath(); l.pts.forEach((p, i) => i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))); const last = l.pts[l.pts.length - 1], first = l.pts[0];
        g.strokeStyle = l.color; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke(); if (!o.noFill) { g.lineTo(X(last.x), Y(0)); g.lineTo(X(first.x), Y(0)); g.closePath(); g.fillStyle = gr; g.fill(); } });
    }
    function drawSpeed() {
      lineChart(spCv, [{ pts: ds.map(p => ({ x: p.t, y: p.v })), color: Ch.css('acc') }, { pts: us.map(p => ({ x: dlLen + p.t, y: p.v })), color: Ch.css('good') }], { xmax: dlLen * 2, split: dlLen, min: 10 });
      const st = arr => { const v = arr.filter(p => p.t > 1.5).map(p => p.v); if (v.length < 4) return null; const avg = v.reduce((a, b) => a + b) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - avg) * (b - avg), 0) / v.length); return { lo: Math.min(...v), avg, hi: Math.max(...v), stab: Math.max(0, Math.min(100, Math.round(100 * (1 - sd / Math.max(avg, 1))))) }; };
      const d = st(ds), u = st(us);
      spStats.replaceChildren(d ? [A.st(C.fmt.mbps(d.lo), 'Down lowest'), A.st(C.fmt.mbps(d.avg), 'Down average'), A.st(C.fmt.mbps(d.hi), 'Down peak'), A.st(d.stab + ' / 100', 'Down steadiness')] : null,
        u ? h('div', { class: 'small mute', style: 'grid-column:1/-1' }, `Upload ranged ${C.fmt.mbps(u.lo)} to ${C.fmt.mbps(u.hi)} Mbps (average ${C.fmt.mbps(u.avg)}, steadiness ${u.stab} / 100). Steadiness 100 = perfectly flat line.`) : null);
    }
    function drawLat(r) {
      const L = r.samples.lat, d = L.filter(p => p.ph === 'down'), u = L.filter(p => p.ph === 'up');
      lineChart(ltCv, [{ pts: d.map(p => ({ x: p.t, y: p.v })), color: Ch.css('acc') }, { pts: u.map(p => ({ x: dlLen + p.t, y: p.v })), color: Ch.css('good') }], { xmax: dlLen * 2, split: dlLen, min: 50, base: r.idle, noFill: true });
    }
    drawSpeed(); lineChart(ltCv, [], { xmax: 16, split: 8, min: 50 });
    let cur = 0, shown = 0, label = 'Mbps', max = 100;
    function gauge(v, sub) {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, hh = cv.clientHeight; cv.width = w * dpr; cv.height = hh * dpr;
      const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, hh);
      const acc = Ch.css('acc'), acc2 = Ch.css('acc2'), line = Ch.css('panel2'), tx = Ch.css('tx'), mute = Ch.css('mute');
      const cx = w / 2, cy = hh - 26, R = Math.min(w / 2 - 22, hh - 56), a0 = Math.PI * 0.85, a1 = Math.PI * 2.15;
      g.lineCap = 'round'; g.lineWidth = 20; g.strokeStyle = line; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
      const f = Math.min(1, Math.log10(1 + v) / Math.log10(1 + max)), gr = g.createLinearGradient(cx - R, cy, cx + R, cy); gr.addColorStop(0, acc); gr.addColorStop(1, acc2);
      g.save(); g.shadowColor = acc; g.shadowBlur = 16; g.strokeStyle = gr; g.beginPath(); g.arc(cx, cy, R, a0, a0 + (a1 - a0) * f); g.stroke(); g.restore();
      for (let i = 0; i <= 10; i++) { const a = a0 + (a1 - a0) * i / 10; g.strokeStyle = mute + '88'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx + (R - 20) * Math.cos(a), cy + (R - 20) * Math.sin(a)); g.lineTo(cx + (R - 26) * Math.cos(a), cy + (R - 26) * Math.sin(a)); g.stroke(); }
      g.fillStyle = tx; g.textAlign = 'center'; g.font = '800 50px Jakarta,Inter,sans-serif'; g.fillText(v >= 100 ? v.toFixed(0) : v.toFixed(1), cx, cy - 4);
      g.fillStyle = mute; g.font = '600 14px Inter,sans-serif'; g.fillText(sub, cx, cy + 22);
    }
    gauge(0, 'Mbps'); let anim;
    function run() {
      btn.disabled = true; res.replaceChildren(); ds = []; us = []; drawSpeed(); lineChart(ltCv, [], { xmax: 16, split: 8, min: 50 });
      anim = setInterval(() => { shown += (cur - shown) * 0.25; gauge(shown, label); }, 40); A.cleanup(() => clearInterval(anim));
      Speed.run({
        phase: p => { phase.textContent = p === 'Latency' ? 'Measuring idle latency...' : p === 'Done' ? 'Complete' : p + '...'; label = p === 'Upload' ? 'Mbps up' : p === 'Download' ? 'Mbps down' : 'Mbps'; cur = 0; shown = 0; },
        speed: (v, ph) => { cur = v; max = Math.max(100, Math.min(1000, v * 2)); const arr = ph === 'up' ? us : ds; arr.push({ t: (arr.length + 1) * 0.2, v }); drawSpeed(); }, latency: () => {}
      }).then(r => { clearInterval(anim); gauge(r.down, 'Mbps down'); phase.textContent = 'Complete'; btn.disabled = false; drawSpeed(); drawLat(r); showResult(r); res.append(A.readinessCard()); const hist = A.store.get('speedhist', []); const { samples, ...slim } = r; hist.unshift(slim); A.store.set('speedhist', hist.slice(0, 30)); A.ctx.lastSpeed = r; })
        .catch(e => { clearInterval(anim); btn.disabled = false; phase.textContent = 'Test failed: ' + (e.message || 'network blocked'); });
    }
    btn.onclick = run;
    function showResult(r) {
      const g = C.bloatGrade(r.bloat), gt = ['A+', 'A'].includes(g) ? 'good' : g === 'B' || g === 'C' ? 'warn' : 'bad';
      const speedWords = r.down >= 200 ? 'Fast: handles 4K streaming, big downloads and many devices.' : r.down >= 50 ? 'Good for streaming, video calls and a busy household.' : r.down >= 15 ? 'Fine for browsing and HD video for a few people.' : 'Slow: expect buffering and slow pages.';
      res.replaceChildren(
        A.card('Result', h('div', { class: 'grid' }, A.st(C.fmt.mbps(r.down), 'Download Mbps'), A.st(C.fmt.mbps(r.up), 'Upload Mbps'), A.st(C.fmt.ms(r.idle), 'Idle latency'), A.st(r.jitter.toFixed(1) + ' ms', 'Jitter')), h('div', { class: 'small', style: 'margin-top:10px' }, speedWords)),
        A.card('Lag under load (bufferbloat)', h('div', { class: 'row' }, h('div', { class: 'grade ' + (r.noisy ? '' : gt) }, g + (r.noisy ? '?' : '')), h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, '+' + Math.round(r.bloat) + ' ms extra delay when the line is busy'), h('div', { class: 'small mute' }, C.bloatText(r.bloat)))),
          h('div', { class: 'small', style: 'margin-top:12px' }, `What this measures: your normal delay was ${C.fmt.ms(r.idle)}. While the speed test filled the line, delay was ${r.loadDown ? C.fmt.ms(r.loadDown) : '-'} on download (${r.bloatDown != null ? '+' + Math.round(r.bloatDown) : '-'} ms) and ${r.loadUp ? C.fmt.ms(r.loadUp) : '-'} on upload (${r.bloatUp != null ? '+' + Math.round(r.bloatUp) : '-'} ms). The grade uses the worse of the two.`),
          (r.bloatUp || 0) > (r.bloatDown || 0) + 40 ? h('div', { class: 'small', style: 'margin-top:8px' }, 'Upload is the worse side. That is typical for cable internet: the upload pipe is small (' + C.fmt.mbps(r.up) + ' Mbps here) and fills first. It only hurts when something is uploading, like a video call or cloud backup, while you are also doing other things.') : null,
          r.noisy || !r.sepProbe ? h('div', { class: 'find s1', style: 'margin-top:10px' }, h('b', {}, 'Low confidence: treat this grade as a hint'), h('div', { class: 'why' }, `Your idle delay jumped around by ${r.jitter.toFixed(0)} ms between pings${(r.nDown || 0) < 8 || (r.nUp || 0) < 8 ? ' and only a few measurements were taken under load' : ''}. A phone browser adds its own delay (Wi-Fi power saving, background tabs, other apps), which can look like bufferbloat even when the router is fine. Run it 2 or 3 times with the screen on and nothing else running. If it is still bad, try from a laptop on Ethernet: that isolates the router and modem from the phone.`)) : null,
          h('details', { style: 'margin-top:10px' }, h('summary', {}, 'What do the grades mean?'), h('table', { style: 'margin-top:8px' }, h('tr', {}, ['Grade', 'Extra delay', 'What you would feel'].map(x => h('th', {}, x))),
            [['A+', 'under 5 ms', 'Nothing. Perfect.'], ['A', 'under 30 ms', 'Nothing noticeable.'], ['B', '30 to 60 ms', 'Slight, only in fast games.'], ['C', '60 to 200 ms', 'Calls and games stutter during big transfers.'], ['D', '200 to 400 ms', 'Clearly laggy when someone is downloading or uploading.'], ['F', 'over 400 ms', 'Everything freezes when the line is full.']].map(rw => h('tr', {}, rw.map(x => h('td', { class: 'small' }, x))))),
            h('div', { class: 'xs mute', style: 'margin-top:8px' }, 'Extra delay = delay while the line is full minus delay when idle. The scale is the same one used by popular bufferbloat tests. Speed has nothing to do with it: a fast line can still have bad bufferbloat. Fix is SQM / smart queue (fq_codel or CAKE) in the router, or limit the router speed to about 90% of the line.'))));
    }
    if (!A.adv()) { const hist = A.store.get('speedhist', []); if (hist[0]) showResult(hist[0]); return; }
    // ---- line quality (advanced)
    const dur = h('select', {}, [30, 60, 120, 300].map(s => h('option', { value: s }, s < 120 ? s + ' seconds' : (s / 60) + ' minutes'))), tgt = h('select', {}, A.targets().map((t, i) => h('option', { value: i }, t.name)));
    const lqOut = h('div', {}), lqBtn = h('button', { class: 'sm' }, 'Run line-quality test'), lqProg = h('div', { class: 'bar hide', style: 'margin-top:10px' }, h('i', { style: 'width:0' }));
    root.append(A.card('Line quality (loss and jitter)', h('div', { class: 'small mute' }, 'A ping every 200 ms, graded A+ to F. Loss and jitter matter more than speed for calls and games.'), h('div', { class: 'row', style: 'margin-top:10px' }, h('div', { class: 'grow' }, dur), h('div', { class: 'grow' }, tgt)), h('div', { style: 'margin-top:10px' }, lqBtn), lqProg, lqOut));
    lqBtn.onclick = async () => {
      lqBtn.disabled = true; lqProg.classList.remove('hide'); const total = +dur.value * 5, t = A.targets()[+tgt.value], samples = [], cv2 = h('canvas', { style: 'height:80px;margin-top:10px' }); lqOut.replaceChildren(cv2);
      for (let i = 0; i < total; i++) {
        const t0 = performance.now(), [rtt, ok] = await webPing(t.url); samples.push(ok ? rtt : -1);
        lqProg.firstChild.style.width = (i / total * 100) + '%'; if (i % 5 === 0) A.spark(cv2, samples.slice(-120));
        const wait = 200 - (performance.now() - t0); if (wait > 0) await A.sleep(wait); if (A.tab !== 'speed') return;
      }
      const s = C.lineStats(samples), gt = s.grade[0] === 'A' ? 'good' : s.grade === 'B' || s.grade === 'C' ? 'warn' : 'bad', ok = samples.filter(v => v >= 0);
      const data = [['Under 20 ms', v => v <= 20, 'good'], ['20-50 ms', v => v > 20 && v <= 50, 'acc'], ['50-100 ms', v => v > 50 && v <= 100, 'info'], ['100-200 ms', v => v > 100 && v <= 200, 'warn'], ['Over 200 ms', v => v > 200, 'bad']].map(([label, f, c]) => ({ label, color: Ch.css(c), value: ok.filter(f).length })); data.push({ label: 'Lost', color: '#94a3b8', value: s.lost });
      lqOut.replaceChildren(cv2, h('div', { class: 'row', style: 'margin:12px 0' }, h('div', { class: 'grade ' + gt }, s.grade), h('div', { class: 'grow' }, h('div', { class: 'small' }, C.lineVerdict(s.grade)), h('div', { class: 'small mute' }, `loss ${s.lossPct.toFixed(1)}%  |  jitter ${s.jitter.toFixed(1)} ms  |  avg ${s.avg.toFixed(0)} ms  |  p95 ${s.p95.toFixed(0)} ms  |  max ${s.max.toFixed(0)} ms`))), Ch.donutCard(data, { size: 150, big: samples.length, small: 'pings' }));
      A.spark(cv2, samples.slice(-200)); A.ctx.lastLine = Object.assign({ target: t.name }, s); lqBtn.disabled = false; lqProg.classList.add('hide');
    };
    const hist = A.store.get('speedhist', []);
    if (hist.length) { const rows = hist.slice(0, 8).reverse(), mx = Math.max(...rows.map(r => Math.max(r.down, r.up)), 1);
      root.append(A.card('Past tests', h('div', { style: 'display:flex;align-items:flex-end;gap:8px;height:110px;margin-bottom:6px' }, rows.map(r => h('div', { style: 'flex:1;display:flex;gap:2px;align-items:flex-end;height:100%', title: new Date(r.at).toLocaleString() }, h('i', { style: `flex:1;height:${Math.max(4, r.down / mx * 100)}%;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,var(--acc2),var(--acc))` }), h('i', { style: `flex:1;height:${Math.max(4, r.up / mx * 100)}%;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,var(--good),color-mix(in srgb,var(--good) 60%,#000))` })))),
        h('div', { class: 'legend' }, h('div', { class: 'li' }, h('i', { style: 'background:var(--acc)' }), 'Download'), h('div', { class: 'li' }, h('i', { style: 'background:var(--good)' }), 'Upload')),
        h('table', { style: 'margin-top:10px' }, h('tr', {}, ['When', 'Down', 'Up', 'Idle', 'Bloat'].map(x => h('th', {}, x))), hist.slice(0, 8).map(r => h('tr', {}, h('td', {}, new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })), h('td', {}, C.fmt.mbps(r.down)), h('td', {}, C.fmt.mbps(r.up)), h('td', {}, Math.round(r.idle) + ' ms'), h('td', {}, C.bloatGrade(r.bloat)))))));
    }
  };
})();
