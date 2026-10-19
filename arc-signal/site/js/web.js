/* ARC Signal - what the WEB / PC version can do: import a Wi-Fi scan from the device, install panel, platform comparison. */
(function () {
  'use strict';
  const A = window.App, C = window.Core, N = window.Native, Ch = window.Charts, h = A.h;
  A.mine = () => (A.ctx.wifi && A.ctx.wifi.bssid) || A.ctx.mineBssid || null;

  /* ---------- parsers ---------- */
  const pct2dbm = p => Math.round(p / 2 - 100);
  const freqOf = (band, ch) => band === '6 GHz' ? 5950 + 5 * ch : band === '5 GHz' ? 5000 + 5 * ch : ch === 14 ? 2484 : 2407 + 5 * ch;
  const secMap = (a, e) => { a = (a || '').toLowerCase(); return /open/.test(a) ? 'OPEN' : /wpa3/.test(a) ? (/enterprise|802\.1x|eap/.test(a) ? 'WPA3-EAP' : 'WPA3-SAE') : /wpa2/.test(a) ? (/enterprise|802\.1x|eap/.test(a) ? 'WPA2-EAP' : 'WPA2-PSK') : /wpa/.test(a) ? 'WPA' : /wep/.test(a) ? 'WEP' : (a || '').toUpperCase(); };
  const stdMap = (r, band) => /be|7/.test(r) ? 'Wi-Fi 7' : /ax|6/.test(r) ? (band === '6 GHz' ? 'Wi-Fi 6E' : 'Wi-Fi 6') : /ac|5/.test(r) ? 'Wi-Fi 5' : /n|4/.test(r) ? 'Wi-Fi 4' : '';
  function parseNetsh(t) {
    const out = []; let ssid = '', auth = '', cur = null;
    const push = () => { if (cur && cur.bssid && cur.channel) { const band = cur.band || (cur.channel > 14 ? '5 GHz' : '2.4 GHz'); out.push({ ssid, bssid: cur.bssid.toLowerCase(), level: pct2dbm(cur.pct || 0), frequency: freqOf(band, cur.channel), width: band === '2.4 GHz' ? 20 : 80, security: secMap(auth), open: /open/i.test(auth), standard: stdMap(cur.radio || '', band), widthGuess: true }); } cur = null; };
    for (const raw of t.split(/\r?\n/)) {
      let m;
      if ((m = raw.match(/^\s*SSID\s+\d+\s*:\s*(.*)$/i))) { push(); ssid = m[1].trim(); auth = ''; }
      else if ((m = raw.match(/^\s*Authentication\s*:\s*(.*)$/i))) auth = m[1].trim();
      else if ((m = raw.match(/^\s*BSSID\s+\d+\s*:\s*([0-9a-f:]{17})/i))) { push(); cur = { bssid: m[1] }; }
      else if (cur && (m = raw.match(/^\s*Signal\s*:\s*(\d+)\s*%/i))) cur.pct = +m[1];
      else if (cur && (m = raw.match(/^\s*Radio type\s*:\s*(.*)$/i))) cur.radio = m[1].replace('802.11', '').trim();
      else if (cur && (m = raw.match(/^\s*Band\s*:\s*([\d.]+)\s*GHz/i))) cur.band = (+m[1] > 5.9 ? '6' : m[1] === '5' ? '5' : '2.4') + ' GHz';
      else if (cur && (m = raw.match(/^\s*Channel\s*:\s*(\d+)/i))) cur.channel = +m[1];
    }
    push(); return out;
  }
  function parseNmcli(t) {                                   // nmcli -t -f SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY dev wifi
    const out = [];
    for (const line of t.split(/\r?\n/)) {
      const f = line.replace(/\\:/g, '\u0001').split(':').map(x => x.replace(/\u0001/g, ':')); if (f.length < 6 || !/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(f[1])) continue;
      const fr = parseInt(f[3]); out.push({ ssid: f[0], bssid: f[1].toLowerCase(), level: pct2dbm(+f[4]), frequency: fr || 0, width: fr < 3000 ? 20 : 80, security: f[5] ? secMap(f[5].replace(/WPA2/, 'WPA2 ').replace('--', '')) || 'WPA2-PSK' : 'OPEN', open: !f[5] || f[5] === '--', widthGuess: true });
    }
    return out;
  }
  function parseAny(text) {
    const t = (text || '').trim(); if (!t) throw new Error('Nothing pasted');
    if (/^[\[{]/.test(t)) { let j; try { j = JSON.parse(t); } catch (e) { throw new Error('That looks like JSON but could not be read'); } const arr = Array.isArray(j) ? j : j.networks; if (!Array.isArray(arr)) throw new Error('JSON has no "networks" list'); return { src: 'ARC Signal export', nets: arr }; }
    if (/BSSID\s+\d+\s*:/i.test(t)) return { src: 'Windows (netsh)', nets: parseNetsh(t) };
    if (/^[^:\n]*:[0-9a-f]{2}\\?:[0-9a-f]{2}/im.test(t)) { const n = parseNmcli(t); if (n.length) return { src: 'Linux (nmcli)', nets: n }; }
    throw new Error('Could not recognise this. Paste the output of the command shown, or an ARC Signal export.');
  }

  /* ---------- shared loader ---------- */
  A.loadNets = async function (raw, meta) {
    meta = meta || {};
    const nets = raw.map(n => { const frequency = +n.frequency; return { ...n, ssid: n.ssid || '', bssid: (n.bssid || '').toLowerCase(), level: +n.level, frequency, channel: n.channel || C.channelOf(frequency), band: C.bandOf(frequency), center: n.center || frequency, width: n.width || 20, security: n.security || '', open: n.open != null ? n.open : /OPEN/.test(n.security || '') }; }).filter(n => n.bssid && n.frequency && isFinite(n.level));
    if (!nets.length) throw new Error('No networks found in that data');
    nets.sort((a, b) => b.level - a.level);
    const vendors = {}; await Promise.all(nets.map(async n => { vendors[n.bssid] = await A.vendor(n.bssid); }));
    Object.assign(A.ctx, { nets, vendors, scanAt: meta.at || Date.now(), throttled: false, importSrc: meta.src || null });
    if (meta.src) { const ms = A.store.get('mineSsid', null); if (ms) { const m = nets.filter(n => n.ssid === ms).sort((a, b) => b.level - a.level)[0]; A.ctx.mineBssid = m ? m.bssid : null; } }
    const mine = A.mine(); A.ctx.rogue = C.rogueScan(nets, mine, vendors); A.ctx.findings = C.analyzeWifi(nets, mine).filter(f => f.tag !== 'rogue');
    return nets;
  };
  A.pickMine = async function (ssid) { A.store.set('mineSsid', ssid); await A.loadNets(A.ctx.nets, { src: A.ctx.importSrc, at: A.ctx.scanAt }); };
  A.restoreImport = async function () { if (N.live || A.ctx.nets) return; const s = A.store.get('import', null); if (s && s.nets) { try { await A.loadNets(s.nets, { src: s.src, at: s.at }); } catch (e) {} } };
  A.clearImport = function () { A.store.set('import', null); ['nets', 'vendors', 'rogue', 'findings', 'mineBssid', 'importSrc'].forEach(k => delete A.ctx[k]); };
  A.exportScan = function () {
    const nets = (A.ctx.nets || []).map(({ ssid, bssid, level, frequency, width, security, center, standard, util, stations, k, v, r }) => ({ ssid, bssid, level, frequency, width, security, center, standard, util, stations, k, v, r }));
    if (!nets.length) return A.toast('Scan first');
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify({ app: 'ARC Signal', at: new Date().toISOString(), networks: nets }, null, 1)], { type: 'application/json' })), download: 'arc-signal-wifi-scan.json' }); document.body.append(a); a.click(); setTimeout(() => a.remove(), 400);
  };

  /* ---------- import sheet ---------- */
  const CMDS = [['Windows PC or laptop', 'Open Command Prompt, run this, then paste here:', 'netsh wlan show networks mode=bssid | clip', 'Windows may need Location turned on in Settings > Privacy for results.'],
    ['Linux / Raspberry Pi', 'Run this and paste the result:', "nmcli -t -f SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY dev wifi | cat", ''],
    ['Android or other ARC Signal app', 'In the Android app: Wi-Fi tab > Export. Then open the file and paste it, or choose it below.', '', '']];
  A.importSheet = function (done) {
    const ta = h('textarea', { rows: 7, placeholder: 'Paste the scan text here...', style: 'font-size:13px' }), msg = h('div', { class: 'small', style: 'margin-top:8px' }); let sh;
    const go = async text => { try { const p = parseAny(text), at = Date.now(); await A.loadNets(p.nets, { src: p.src, at }); A.store.set('import', { nets: p.nets, src: p.src, at }); sh.close(); A.toast(`Loaded ${A.ctx.nets.length} networks`); done && done(); } catch (e) { msg.className = 'small bad'; msg.textContent = e.message; } };
    const file = h('input', { type: 'file', accept: '.json,.txt,.csv', style: 'display:none', onchange: e => { const f = e.target.files[0]; if (f) f.text().then(go); } });
    sh = A.sheet([h('div', { class: 'row sp', style: 'margin-bottom:8px' }, h('b', { class: 'head', style: 'font-size:18px' }, 'Load a Wi-Fi scan'), h('button', { class: 'sm ghost', onclick: () => sh.close() }, 'Close')),
      h('div', { class: 'small mute', style: 'margin-bottom:10px' }, 'A web page is not allowed to scan Wi-Fi. But your computer can, and you can hand the result to this page. Everything below (band maps, mesh, rogue check, radar) then works on that data. Nothing is uploaded; it stays in this browser.'),
      CMDS.map(([t, d, c, n]) => h('div', { class: 'find s0', style: 'margin-bottom:8px' }, h('b', {}, t), h('div', { class: 'why' }, d), c ? h('div', { class: 'row', style: 'margin-top:6px' }, h('code', { class: 'grow', style: 'font-size:12px;word-break:break-all' }, c), h('button', { class: 'sm ghost', onclick: e => { navigator.clipboard && navigator.clipboard.writeText(c).then(() => e.target.textContent = 'Copied'); } }, 'Copy')) : null, n ? h('div', { class: 'xs mute', style: 'margin-top:4px' }, n) : null)),
      ta, h('div', { class: 'row wrap', style: 'margin-top:10px' }, h('button', { onclick: () => go(ta.value) }, 'Analyze'), h('button', { class: 'ghost', onclick: () => file.click() }, 'Choose a file'), file), msg]);
  };

  /* ---------- install panel ---------- */
  const UA = navigator.userAgent, IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), AND = /Android/.test(UA), PC = !IOS && !AND;
  A.installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || N.isNative || N.isDesktop;
  /* Where the Android app is downloaded from. Leave '' to use ARC-Signal.apk next to index.html,
     or paste a full link (for example a GitHub release link) to download it from somewhere else. */
  const APK_URL = 'https://github.com/ARCprosIO/arc-signal/releases/download/v1.0/ARC-Signal.apk';
  const FILES = [[APK_URL || 'ARC-Signal.pk', 'Android app (full version)', 'and']];
  const checkFile = f => APK_URL ? Promise.resolve({ ok: true }) : fetch(f, { method: 'HEAD', cache: 'no-store' });
  A.installPanel = function (compact) {
    const box = h('div', {}), links = h('div', { class: 'row wrap', style: 'margin-top:10px' }), note = h('div', { class: 'xs mute', style: 'margin-top:8px' });
    const steps = IOS ? ['Open this page in Safari (not inside another app).', 'Tap the Share button (square with an arrow).', 'Scroll and tap Add to Home Screen, then Add.'] :
      AND ? ['Download the full Android app below. It scans Wi-Fi, shows the bands, finds every device and runs the port scanner and trace route.', 'Open the downloaded file. Android will ask to allow installs from this browser: allow it once, then tap Install.', 'Only want the limited version? Tap Install below to add the website to your home screen instead.'] :
      ['On a PC, ARC Signal runs as the limited version: speed test, outage check, ping test, fix guide, reports, and Wi-Fi graphs from a pasted scan.', 'To keep it handy, click the install icon at the right end of the address bar (Chrome / Edge). It opens in its own window.', 'For the full app with live Wi-Fi scanning and device discovery, use an Android phone.'];
    const inst = A.installEvt ? h('button', { onclick: () => A.installEvt.prompt() }, 'Install ARC Signal') : null;
    box.append(h('div', { class: 'row', style: 'margin-bottom:8px' }, h('div', { class: 'ic sm', html: Icons.svg(IOS || AND ? 'phone' : 'pc') }), h('b', {}, IOS ? 'iPhone / iPad (limited version)' : AND ? 'Android phone (full app)' : 'Windows / Mac PC (limited version)')), h('ol', { class: 'small', style: 'margin:0 0 6px 18px;padding:0;line-height:1.6' }, steps.map(s => h('li', {}, s))), inst, links, note);
    if (!compact) box.append(h('div', { class: 'xs mute', style: 'margin-top:10px' }, 'Full app: Android only. iPhone and PC use the limited version, which runs from this website.'));
    const want = AND ? 'and' : null;
    Promise.all(FILES.map(([f, l, k]) => checkFile(f).then(r => { if (r.ok) { links.append(h('a', { href: f, download: 'ARC-Signal.apk', class: 'btn sm' }, 'Download: ' + l)); return k; } return null; }).catch(() => null))).then(r => { if (want && !r.includes(want)) note.textContent = 'The Android download is not available yet. Check back soon.'; });
    return box;
  };

  /* ---------- clear "you are on the web version" explanations ---------- */
  let dlCache = null;
  A.findDownloads = () => dlCache || (dlCache = Promise.all(FILES.map(([f, l, k]) => checkFile(f).then(r => r.ok ? { f, l, k } : null).catch(() => null))).then(a => a.filter(Boolean)));
  const sheetHead = (t, sh) => h('div', { class: 'row sp', style: 'margin-bottom:10px' }, h('b', { class: 'head', style: 'font-size:18px' }, t), h('button', { class: 'sm ghost', onclick: () => sh().close() }, 'Close'));
  A.lockCard = function (what, o) {
    o = o || {}; const box = h('div', { class: 'card banner', style: 'margin:0' }), dl = h('div', { class: 'row wrap', style: 'margin-top:12px' }), near = h('div', { class: 'xs mute', style: 'margin-top:8px' });
    const lead = 'This tool is only in the full Android app.';
    box.append(h('h2', {}, lead), h('div', { class: 'small' }, `What you tapped (${what.charAt(0).toLowerCase() + what.slice(1).replace(/\.$/, '')}) needs access to the device's Wi-Fi radio and local network. A web page is not allowed to have that. It is a browser safety rule, not a bug.`),
      !N.live ? h('div', { class: 'small', style: 'margin-top:8px' }, h('b', {}, 'You are using the web version.'), ' Adding the website to your home screen does not change that, because it is still the website. The full Android app is a separate download that is allowed to do this.') : null,
      h('div', { class: 'small', style: 'margin-top:10px' }, h('b', {}, 'What you can do right now:')),
      h('div', { class: 'chips', style: 'margin-top:6px' }, [['Speed test', 'speed'], ['Outage check', 'outage'], ['Fix a problem', 'help']].map(([l, id]) => h('span', { class: 'chip', onclick: () => { document.querySelectorAll('.sheet').forEach(s => s.remove()); A.go(id); } }, l)), h('span', { class: 'chip', onclick: () => { document.querySelectorAll('.sheet').forEach(s => s.remove()); A.tools.ping(); } }, 'Ping test')),
      h('div', { class: 'small', style: 'margin-top:12px' }, h('b', {}, AND ? 'Get the full Android app:' : 'The full app is Android only')), !AND ? h('div', { class: 'small mute' }, (IOS ? 'Apple does not let any app scan Wi-Fi or the local network, so iPhone stays on the limited version.' : 'Browsers on a PC cannot scan Wi-Fi or the local network, so a PC stays on the limited version.') + ' To use this tool, open ARC Signal on an Android phone.') : dl, near);
    if (AND) A.findDownloads().then(found => { const want = ['and'], hit = found.filter(x => want.includes(x.k)); hit.forEach(x => dl.append(h('a', { href: x.f, download: 'ARC-Signal.apk', class: 'btn sm' }, 'Download: ' + x.l)));
      if (!hit.length) near.textContent = 'The Android app is not available to download yet. Check back soon.'; else near.textContent = 'After it downloads, open it. Android will ask to allow installs from this browser: allow it once, then tap Install.'; });
    return box;
  };
  A.lockSheet = function (what, o) { let sh; sh = A.sheet([sheetHead('Needs the app', () => sh), A.lockCard(what, o)]); return sh; };
  A.howSheet = function () { let sh; sh = A.sheet([sheetHead('What the web version can and cannot do', () => sh), A.compareCard(), A.card('Get the app', A.installPanel())]); };
  A.connBar = function () {
    const box = h('div', {}), c = () => navigator.connection || {};
    function paint() {
      const type = c().type, on = navigator.onLine, w = A.ctx.wifi; let net = 'Online', tone = 'good';
      if (!on) { net = 'Offline'; tone = 'bad'; } else if (N.live && w && w.ssid) net = 'Wi-Fi: ' + w.ssid; else if (type === 'cellular') { net = 'Mobile data'; tone = 'warn'; } else if (type === 'wifi') net = 'Wi-Fi'; else if (type === 'ethernet') net = 'Wired';
      const ver = N.isNative ? 'Full app (Android)' : N.isDesktop ? 'Windows app' : 'Limited version';
      box.replaceChildren(h('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:' + (((type === 'cellular' && ['home', 'wifi'].includes(A.tab)) || !on) ? '6px' : '12px') }, h('span', { class: 'pill info' }, ver), h('span', { class: 'pill ' + tone }, net), !N.live ? h('button', { class: 'sm ghost', style: 'min-height:30px;padding:3px 12px', onclick: () => A.howSheet() }, 'What am I missing?') : null),
        type === 'cellular' && on && ['home', 'wifi'].includes(A.tab) ? h('div', { class: 'find s1', style: 'margin-bottom:12px' }, h('b', {}, 'You are on mobile data'), h('div', { class: 'why' }, 'That includes the case where your phone is sharing its own hotspot. Speed and ping tests right now measure your cell service, not Wi-Fi. To look at a Wi-Fi network, connect to it first.'), AND ? h('a', { class: 'btn sm', style: 'margin-top:8px', href: 'intent:#Intent;action=android.settings.WIFI_SETTINGS;end' }, 'Open Wi-Fi settings') : null, AND ? h('div', { class: 'xs mute', style: 'margin-top:6px' }, 'If the button does nothing: swipe down from the top and long-press the Wi-Fi icon.') : null) : null,
        !on ? h('div', { class: 'find s2', style: 'margin-bottom:12px' }, h('b', {}, 'No internet connection'), h('div', { class: 'why' }, 'Connect to Wi-Fi or turn on mobile data, then try again.')) : null);
    }
    paint(); A.every(4000, paint); try { c().addEventListener && c().addEventListener('change', paint); } catch (e) {} return box;
  };

  /* what to show when a live Wi-Fi scan fails: say what happened and give the one button that fixes it */
  A.scanProblem = function (e, retry) {
    const msg = String((e && e.message) || e || ''), perm = /permission/i.test(msg), box = h('div', { class: 'card banner' });
    const intent = (action, extra) => 'intent:#Intent;action=' + action + ';' + (extra || '') + 'end';
    box.append(h('h2', {}, perm ? 'Allow Location so ARC Signal can scan' : 'The scan did not work'),
      h('div', { class: 'small' }, perm ? 'Android treats Wi-Fi scanning as a location feature, so it will not show nearby networks until Location is allowed. ARC Signal does not store or send your location.' : msg || 'Something went wrong while scanning.'),
      h('div', { class: 'row wrap', style: 'margin-top:12px' },
        perm ? h('button', { onclick: async () => { try { await window.Capacitor.Plugins.NetScan.requestPermissions(); } catch (x) {} retry && retry(); } }, 'Allow Location') : null,
        h('a', { class: 'btn sm ghost', href: intent('android.settings.APPLICATION_DETAILS_SETTINGS', 'data=package:io.arcpros.signal;') }, 'Open app settings'),
        h('a', { class: 'btn sm ghost', href: intent('android.settings.LOCATION_SOURCE_SETTINGS') }, 'Open Location settings'),
        h('button', { class: 'sm ghost', onclick: () => retry && retry() }, 'Try again')),
      h('div', { class: 'xs mute', style: 'margin-top:10px' }, 'Also check: Location is switched on in the quick settings, and the phone is not sharing a hotspot. Android only allows about 4 scans every 2 minutes, so wait a moment if you just scanned.'));
    return box;
  };

  A.installBanner = function () {
    if (A.installed() || A.store.get('hideInstall', false)) return null;
    return h('div', { class: 'card banner' }, h('div', { class: 'row sp' }, h('h2', { style: 'margin:0' }, 'Install ARC Signal'), h('button', { class: 'sm ghost', onclick: e => { A.store.set('hideInstall', true); e.target.closest('.card').remove(); } }, 'Hide')), h('div', { style: 'margin-top:10px' }, A.installPanel(true)));
  };

  /* ---------- what works where ---------- */
  const Y = '✓', P = '◐', X = '–';
  const MATRIX = [['Live internet checks, speed test, bufferbloat', Y, Y], ['Outage check, readiness, call quality score', Y, Y], ['Ping tester', P + ' web timing', Y], ['Wi-Fi bands, mesh, rogue check, radar', P + ' paste a scan', Y], ['Live Wi-Fi signal of this device', X, Y], ['Find every device + ports', X, Y], ['Trace route, hunt, roam walk', X, Y]];
  A.compareCard = function () {
    return A.card('Limited version vs full app', h('div', { style: 'overflow-x:auto' }, h('table', { style: 'min-width:320px' }, h('tr', {}, ['', 'iPhone and PC (limited)', 'Android (full app)'].map(x => h('th', {}, x))), MATRIX.map(r => h('tr', {}, r.map((c, i) => h('td', { class: i ? 'small ' + (c === Y ? 'good' : c === X ? 'mute' : 'warn') : 'small', style: i ? 'text-align:center;font-weight:700' : '' }, c)))))),
      h('div', { class: 'xs mute', style: 'margin-top:8px' }, Y + ' works   ' + P + ' partly   ' + X + ' not possible. Websites and iPhones are not allowed to read the Wi-Fi radio or scan the local network. Android apps are, which is why the full app is Android only. iPhone and PC use the limited version from this website.'));
  };
  A.modesCard = function () {
    const col = (t, c, items) => h('div', { style: `flex:1;min-width:200px;border-radius:16px;padding:14px;color:#fff;background:linear-gradient(145deg,${c[0]},${c[1]})` }, h('b', { style: 'font-size:16px' }, t), h('div', { class: 'col', style: 'margin-top:8px;font-size:13px;gap:5px' }, items.map(i => h('div', {}, '• ' + i))));
    return A.card('Easy mode vs Advanced mode', h('div', { class: 'row wrap', style: 'align-items:stretch;gap:12px' },
      col('Easy: for everyone', ['#10b981', '#0ea5e9'], ['One health score', 'Plain-language problems and fixes', 'One-tap speed test', 'Simple Wi-Fi channel picture', 'Devices with icons']),
      col('Advanced: for techs', ['#8b5cf6', '#ec4899'], ['Live latency per target', 'Band maps, mesh analyzer, radar, rogue scan', 'Port scan, trace route, DNS race', 'Roam walk, hunt, room survey', 'Modem check, CSV and reports'])), h('div', { class: 'xs mute', style: 'margin-top:8px' }, 'Switch any time with the toggle at the top.'));
  };
  A.restoreImport();
})();
