/* ARC Signal - Outage check, ping tester, My connection, readiness / call quality, small tech tools, Windows-app tools. */
(function () {
  'use strict';
  const A = window.App, C = window.Core, N = window.Native, Ch = window.Charts, h = A.h, T = A.tools, U = A.ui;
  const head = (t, sh) => h('div', { class: 'row sp', style: 'margin-bottom:10px' }, h('b', { class: 'head', style: 'font-size:18px' }, t), h('button', { class: 'sm ghost', onclick: () => sh().close() }, 'Close'));
  const pill = (t, tone) => h('span', { class: 'pill ' + (tone || '') }, t);
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const isPrivate = s => /^(localhost|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(s || '');
  const winOnly = what => A.lockSheet(what, { desktopOnly: true });
  A.pcTeaser = winOnly;

  /* ---------- line chart (shared) ---------- */
  function lineChart(c, pts, o) {
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, hh = c.clientHeight; if (!w) return; c.width = w * dpr; c.height = hh * dpr;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
    const L = 38, Tp = 8, B = 16, pw = w - L - 8, ph = hh - Tp - B, ok = pts.filter(p => p.v >= 0).map(p => p.v), raw = Math.max(o.min || 20, ...ok);
    const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }, ymax = nice(raw * 1.1), n = Math.max(pts.length, o.n || 20), X = i => L + i / Math.max(1, n - 1) * pw, Y = v => Tp + (1 - v / ymax) * ph;
    g.font = '10.5px Inter,sans-serif'; g.textAlign = 'right'; g.fillStyle = Ch.css('mute'); g.strokeStyle = Ch.css('glass-line'); g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = ymax * i / 4; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(w - 8, Y(v)); g.stroke(); g.fillText(v >= 10 ? Math.round(v) : v.toFixed(1), L - 5, Y(v) + 4); }
    const acc = Ch.css('acc'), bad = Ch.css('bad'); let started = false; g.beginPath();
    pts.forEach((p, i) => { if (p.v < 0) { started = false; return; } if (!started) { g.moveTo(X(i), Y(p.v)); started = true; } else g.lineTo(X(i), Y(p.v)); });
    g.strokeStyle = acc; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke();
    pts.forEach((p, i) => { if (p.v < 0) { g.fillStyle = bad + 'cc'; g.fillRect(X(i) - 1.5, Tp, 3, ph); } });
  }

  /* ---------- ping tester ---------- */
  async function pingOnce(hst) {
    if (N.live) { try { const r = await N.call('ping', { host: hst, count: 1, timeout: 1500 }); return r.rtts[0] >= 0 ? r.rtts[0] : -1; } catch (e) { return -1; } }
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 3000), t = performance.now();
    try { await fetch('https://' + hst.replace(/^https?:\/\//, '').replace(/\/.*$/, '') + '/?r=' + Math.random().toString(36).slice(2), { mode: 'no-cors', cache: 'no-store', signal: ac.signal }); return performance.now() - t; } catch (e) { return -1; } finally { clearTimeout(to); }
  }
  T.ping = function (prefill) {
    const gw = A.ctx.wifi && A.ctx.wifi.gateway, preset = [['Cloudflare', N.live ? '1.1.1.1' : 'one.one.one.one'], ['Google', N.live ? '8.8.8.8' : 'dns.google'], ['Xbox Live', 'login.live.com'], ['PlayStation', 'www.playstation.com'], ['Steam', 'store.steampowered.com'], ['Zoom', 'zoom.us']];
    if (N.live && gw) preset.unshift(['Router', gw]);
    const host = h('input', { value: typeof prefill === 'string' ? prefill : preset[0][1], autocapitalize: 'none', spellcheck: 'false' }), cnt = h('select', {}, [[20, '20 pings'], [60, '60 pings'], [200, '200 pings'], [0, 'Until stopped']].map(([v, l]) => h('option', { value: v }, l))), iv = h('select', {}, [[0.5, 'every 0.5 s'], [1, 'every 1 s'], [2, 'every 2 s']].map(([v, l]) => h('option', { value: v, selected: v === 1 }, l)));
    const cv = h('canvas', { style: 'height:170px;margin-top:10px' }), out = h('div', {}), btn = h('button', { style: 'flex:1' }, 'Start'); let running = false, samples = [], sh;
    const note = h('div', { class: 'xs mute', style: 'margin-top:8px' }, N.live ? 'Real ping (ICMP) from this device.' : 'Browser mode times a web request to the host, not a true ping. Local addresses cannot be reached from a web page. The Android and Windows apps do real pings.');
    function draw() {
      lineChart(cv, samples, { min: 30, n: +cnt.value || 60 }); const v = samples.map(s => s.v), s = C.lineStats(v);
      out.replaceChildren(h('div', { class: 'grid', style: 'grid-template-columns:repeat(5,1fr);margin-top:10px' }, A.st(s.min ? Math.round(s.min) : '-', 'Min ms'), A.st(Math.round(s.avg) || '-', 'Avg ms'), A.st(Math.round(s.max) || '-', 'Max ms'), A.st(s.jitter.toFixed(1), 'Jitter'), A.st(s.lossPct.toFixed(1) + '%', 'Loss')),
        s.sent >= 5 ? h('div', { class: 'row', style: 'margin-top:10px' }, h('div', { class: 'grade ' + (s.grade[0] === 'A' ? 'good' : s.grade === 'B' || s.grade === 'C' ? 'warn' : 'bad'), style: 'font-size:38px' }, s.grade), h('div', { class: 'small' }, C.lineVerdict(s.grade))) : null);
    }
    async function go() {
      if (running) { running = false; btn.textContent = 'Start'; return; }
      const hst = host.value.trim(); if (!hst) return A.toast('Enter a host'); if (!N.live && isPrivate(hst)) return A.toast('A web page cannot reach local addresses. Use the full Android app.');
      running = true; samples = []; btn.textContent = 'Stop'; const max = +cnt.value, gap = +iv.value * 1000;
      while (running && (!max || samples.length < max)) { const t0 = performance.now(); samples.push({ v: await pingOnce(hst) }); draw(); const wait = gap - (performance.now() - t0); if (wait > 0 && running) await A.sleep(wait); }
      running = false; btn.textContent = 'Start again';
    }
    btn.onclick = go;
    sh = A.sheet([head('Ping tester', () => sh), h('div', { class: 'chips', style: 'margin-bottom:10px' }, preset.map(([l, v]) => h('span', { class: 'chip', onclick: () => { host.value = v; } }, l))), h('label', {}, 'Host or address'), host, h('div', { class: 'row', style: 'margin-top:8px' }, cnt, iv), h('div', { class: 'row', style: 'margin-top:10px' }, btn), cv, out, note]);
    sh._onclose = () => { running = false; }; draw();
  };

  /* ---------- My connection ---------- */
  T.myconn = async function () {
    const body = h('div', {}, h('div', { class: 'small mute' }, 'Looking up your connection...')); let sh;
    sh = A.sheet([head('My connection', () => sh), body]);
    const j2 = async (u, ms) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 6000); try { return await (await fetch(u, { signal: ac.signal, cache: 'no-store' })).json(); } finally { clearTimeout(t); } };
    let info = null, ip = '', v6 = '';
    try { info = await j2('https://ipwho.is/'); if (info && info.success === false) info = null; } catch (e) {}
    if (!info && N.isDesktop) { try { info = await N.call('publicIp'); } catch (e) {} }
    ip = info && info.ip || ''; if (!ip) { try { ip = (await j2('https://api.ipify.org?format=json')).ip; } catch (e) {} }
    try { v6 = (await j2('https://api6.ipify.org?format=json', 4000)).ip; } catch (e) {}
    let cg = null, hops = []; if (N.live) { try { hops = (await N.call('traceroute', { host: '1.1.1.1', maxHops: 6 })).hops; cg = hops.some(x => x.ip && C.isCGNAT(x.ip)); } catch (e) {} }
    const row = (l, v, tone) => h('div', { class: 'row sp', style: 'padding:9px 0;border-top:1px solid var(--glass-line)' }, h('span', { class: 'small mute' }, l), h('b', { class: tone || '', style: 'text-align:right' }, v));
    if (!ip) { body.replaceChildren(h('div', { class: 'find s2' }, h('b', {}, 'Could not look up your public address'), h('div', { class: 'why' }, 'The lookup services were unreachable. Check your connection and try again.'))); return; }
    const c = info && info.connection || {}, loc = info ? [info.city, info.region, info.country].filter(Boolean).join(', ') : '';
    body.replaceChildren(h('div', { style: 'border-radius:18px;padding:16px;color:#fff;background:linear-gradient(135deg,#0ea5e9,#6366f1);margin-bottom:8px' }, h('div', { style: 'font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase' }, 'Your public IP'), h('div', { class: 'head', style: 'font-size:26px;font-weight:800;word-break:break-all' }, ip), h('div', { style: 'opacity:.9;font-size:13px' }, (c.isp || c.org || '') + (loc ? ' | ' + loc : ''))),
      info ? [row('Provider (ISP)', c.isp || c.org || '-'), row('Network (ASN)', c.asn ? 'AS' + c.asn : '-'), row('Approx. location', loc || '-'), row('Time zone', (info.timezone && info.timezone.id) || '-')] : null,
      row('IPv6', v6 ? 'Working' : 'Not detected', v6 ? 'good' : 'warn'), v6 ? row('IPv6 address', v6) : null,
      N.live ? row('Shared address (CGNAT)', cg === null ? 'Unknown' : cg ? 'Yes' : 'No', cg ? 'warn' : cg === false ? 'good' : '') : null, A.ctx.wifi && A.ctx.wifi.ip ? row('This device (local)', A.ctx.wifi.ip) : null,
      h('div', { class: 'small mute', style: 'margin-top:12px' }, cg ? 'CGNAT means your provider shares one public address between many customers. Port forwarding, remote cameras and some games will not work until you ask the provider for a public address.' : N.live ? 'Location is approximate and comes from the provider address, not GPS.' : 'To check for CGNAT, compare this address with the WAN address on your router status page. If the router shows 100.64.x.x or a different address, you are behind CGNAT. The apps check this automatically.'));
  };

  /* ---------- DNS lookup (DNS over HTTPS) ---------- */
  T.dnslookup = function () {
    const name = h('input', { value: 'example.com', autocapitalize: 'none' }), out = h('div', {}); let type = 'A', sh; const TY = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];
    const chips = h('div', { class: 'chips', style: 'margin:8px 0' }, TY.map(t => h('span', { class: 'chip' + (t === type ? ' on' : ''), onclick: e => { type = t; [...chips.children].forEach(c => c.classList.toggle('on', c.textContent === t)); } }, t)));
    const go = h('button', { onclick: async () => { go.disabled = true; out.replaceChildren(h('div', { class: 'small mute' }, 'Looking up...')); const t0 = performance.now();
      try { const j = await (await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name.value.trim())}&type=${type}`, { headers: { accept: 'application/dns-json' } })).json(), ms = Math.round(performance.now() - t0);
        out.replaceChildren(h('div', { class: 'small mute', style: 'margin:8px 0' }, `${(j.Answer || []).length} record(s) in ${ms} ms (via Cloudflare DNS over HTTPS). Status: ${['OK', 'Format error', 'Server failure', 'Name does not exist'][j.Status] || j.Status}`), (j.Answer || []).length ? h('table', {}, h('tr', {}, ['Name', 'TTL', 'Data'].map(x => h('th', {}, x))), j.Answer.map(a => h('tr', {}, h('td', { class: 'small' }, a.name), h('td', { class: 'small' }, a.TTL), h('td', { class: 'small', style: 'word-break:break-all' }, a.data)))) : null); } catch (e) { out.replaceChildren(h('div', { class: 'bad' }, 'Lookup failed: ' + e.message)); } go.disabled = false; } }, 'Look up');
    sh = A.sheet([head('DNS lookup', () => sh), name, chips, go, out]);
  };

  /* ---------- subnet calculator ---------- */
  const ip2n = s => s.split('.').reduce((a, o) => a * 256 + (+o), 0), n2ip = n => [24, 16, 8, 0].map(s => Math.floor(n / Math.pow(2, s)) % 256).join('.');
  T.subnet = function () {
    const inp = h('input', { value: '192.168.1.10/24', autocapitalize: 'none' }), out = h('div', {}); let sh;
    const calc = () => {
      const m = inp.value.trim().match(/^(\d+\.\d+\.\d+\.\d+)\s*(?:\/(\d+)|\s+(\d+\.\d+\.\d+\.\d+))?$/); if (!m || m[1].split('.').some(o => +o > 255)) return out.replaceChildren(h('div', { class: 'bad small' }, 'Enter an address like 192.168.1.10/24 or 192.168.1.10 255.255.255.0'));
      let p = m[2] != null ? +m[2] : m[3] ? ip2n(m[3]).toString(2).replace(/0/g, '').length : 24; if (p > 32) return out.replaceChildren(h('div', { class: 'bad small' }, 'Prefix must be 0 to 32'));
      const ip = ip2n(m[1]), mask = p === 0 ? 0 : (Math.pow(2, 32) - Math.pow(2, 32 - p)), net = Math.floor(ip / Math.pow(2, 32 - p)) * Math.pow(2, 32 - p), bc = net + Math.pow(2, 32 - p) - 1, hosts = p >= 31 ? Math.pow(2, 32 - p) : Math.pow(2, 32 - p) - 2, first = p >= 31 ? net : net + 1, last = p >= 31 ? bc : bc - 1;
      const bits = Array.from({ length: 32 }, (_, i) => i < p), row = (l, v) => h('div', { class: 'row sp', style: 'padding:7px 0;border-top:1px solid var(--glass-line)' }, h('span', { class: 'small mute' }, l), h('b', { class: 'small' }, v));
      const bar = h('div', { style: 'display:flex;gap:6px;margin:12px 0' }, [0, 1, 2, 3].map(o => h('div', { style: 'flex:1;display:flex;gap:1px' }, bits.slice(o * 8, o * 8 + 8).map(b => h('i', { style: `flex:1;height:22px;border-radius:3px;background:${b ? 'linear-gradient(180deg,var(--acc2),var(--acc))' : 'var(--panel2)'};border:1px solid var(--glass-line)` })))));
      out.replaceChildren(bar, h('div', { class: 'xs mute', style: 'margin-bottom:8px' }, `Blue = network bits (${p}), light = host bits (${32 - p})`), row('Network', n2ip(net) + '/' + p), row('Subnet mask', n2ip(mask)), row('Wildcard', n2ip(4294967295 - mask)), row('Broadcast', n2ip(bc)), row('First usable', n2ip(first)), row('Last usable', n2ip(last)), row('Usable hosts', hosts.toLocaleString()), row('Type', /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(m[1]) ? 'Private (not routable on the internet)' : /^169\.254\./.test(m[1]) ? 'Link-local (no DHCP answer)' : /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(m[1]) ? 'CGNAT shared space' : 'Public'));
    };
    inp.oninput = calc; sh = A.sheet([head('Subnet calculator', () => sh), inp, out]); calc();
  };

  /* ---------- MAC lookup ---------- */
  T.maclookup = function () {
    const inp = h('input', { placeholder: 'aa:bb:cc:dd:ee:ff', autocapitalize: 'none' }), out = h('div', {}); let sh;
    const go = async () => { const hex = inp.value.replace(/[^0-9a-f]/gi, '').toLowerCase(); if (hex.length < 6) return out.replaceChildren(h('div', { class: 'small mute' }, 'Type at least the first 6 characters of the MAC address.'));
      const mac = (hex + '000000000000').slice(0, 12).match(/../g).join(':'), v = await A.vendor(mac), local = (parseInt(hex.slice(1, 2), 16) & 2) !== 0;
      out.replaceChildren(h('div', { class: 'card', style: 'margin:12px 0 0' }, h('b', { class: 'head', style: 'font-size:18px' }, local ? 'Private / random address' : (v || 'Unknown maker')), h('div', { class: 'small mute', style: 'margin-top:6px' }, local ? 'The address has the "locally administered" bit set. Phones and laptops use these random addresses to avoid tracking, so there is no maker to look up. Turn off Private Wi-Fi Address for the network to see the real one.' : v ? 'Maker found in the IEEE registry.' : 'Not in the registry. Could be new, or a locally set address.'))); };
    inp.oninput = go; sh = A.sheet([head('MAC address lookup', () => sh), inp, out]);
  };

  /* ---------- captive portal check ---------- */
  T.captive = async function () {
    const body = h('div', { class: 'small mute' }, 'Checking...'); let sh; sh = A.sheet([head('Captive portal check', () => sh), body]);
    const probe = async u => { try { const r = await fetch(u + '?r=' + Math.random(), { mode: 'no-cors', redirect: 'manual', cache: 'no-store' }); return r.type; } catch (e) { return 'error'; } };
    const [a, b] = await Promise.all([probe('https://connectivitycheck.gstatic.com/generate_204'), probe('https://www.apple.com/library/test/success.html')]);
    const portal = a === 'opaqueredirect' || b === 'opaqueredirect', down = a === 'error' && b === 'error';
    body.replaceChildren(h('div', { class: 'find ' + (portal ? 's1' : down ? 's2' : 's0') }, h('b', {}, portal ? 'A sign-in page is probably blocking the internet' : down ? 'No internet reachable' : 'No sign-in page detected'), h('div', { class: 'why' }, portal ? 'Test addresses were redirected, which is what hotel, guest and ISP "accept terms" pages do. Open any http:// website in a browser to get the sign-in page.' : down ? 'Neither test address answered. Check Wi-Fi or the modem.' : 'The test addresses answered directly.')), h('div', { class: 'xs mute', style: 'margin-top:8px' }, 'Browsers cannot read the answer itself, only whether it was redirected, so this is a good hint, not proof.'));
  };

  /* ---------- readiness + call quality ---------- */
  A.readiness = function () {
    const sp = A.ctx.lastSpeed || A.store.get('speedhist', [])[0], sn = A.probes.map(p => p.snap()).filter(s => s.avg); if (!sn.length && !sp) return null;
    const lat = sn.length ? mean(sn.map(s => s.avg)) : sp.idle, jit = sn.length ? mean(sn.map(s => s.jitter)) : sp.jitter, loss = sn.length ? mean(sn.map(s => s.lossPct)) : 0, down = sp && sp.down, up = sp && sp.up, bloat = sp && sp.bloat;
    const eff = lat + jit * 2 + 10; let R = eff < 160 ? 93.2 - eff / 40 : 93.2 - (eff - 120) / 10; R -= loss * 2.5; R = Math.max(0, Math.min(100, R)); const mos = Math.max(1, Math.min(4.5, 1 + 0.035 * R + 7e-6 * R * (R - 60) * (100 - R)));
    const lv = mos >= 4.3 ? ['Excellent', 'good'] : mos >= 4.0 ? ['Good', 'good'] : mos >= 3.6 ? ['Fair', 'warn'] : ['Poor', 'bad'];
    const why = [];
    const call = (mos >= 4 && (up == null || up >= 3) && (down == null || down >= 3)) ? 'good' : mos >= 3.6 ? 'warn' : 'bad';
    const game = lat < 40 && jit < 10 && loss < 0.5 && (bloat == null || bloat < 60) ? 'good' : lat < 80 && jit < 25 && loss < 2 ? 'warn' : 'bad';
    const gnote = lat >= 40 ? `delay ${Math.round(lat)} ms` : jit >= 10 ? `jitter ${jit.toFixed(0)} ms` : loss >= 0.5 ? `${loss.toFixed(1)}% loss` : bloat != null && bloat >= 60 ? 'lag when the line is busy' : 'low delay, steady';
    const nf = down == null ? ['warn', 'Run a speed test'] : down >= 25 && loss < 2 ? ['good', '4K ready'] : down >= 10 ? ['warn', 'HD ready (4K may buffer)'] : ['bad', 'SD only'];
    const wfh = lat < 80 && jit < 20 && loss < 1 && (down == null || down >= 25) ? 'good' : lat < 150 && loss < 3 ? 'warn' : 'bad';
    const cam = up == null ? ['warn', 'Run a speed test'] : up >= 20 ? ['good', `${Math.round(up)} Mbps up`] : up >= 5 ? ['warn', `${Math.round(up)} Mbps up (a few cameras)`] : ['bad', `${up.toFixed(1)} Mbps up`];
    return { mos, lv, items: [['phone', 'Video calls (Zoom, Teams, FaceTime)', call, call === 'good' ? 'smooth' : mos < 3.6 ? 'choppy risk' : 'mostly fine'], ['game', 'Online gaming (Xbox, PS5, PC)', game, gnote], ['tv', 'Netflix and YouTube', nf[0], nf[1]], ['laptop', 'Work from home and VPN', wfh, wfh === 'good' ? 'solid' : 'delay or loss may show'], ['camera', 'Cameras and cloud backup', cam[0], cam[1]]] };
  };
  A.readinessCard = function () {
    const card = A.card('Is my internet good enough for...'); const col = { good: 'linear-gradient(150deg,#10b981,#0ea5e9)', warn: 'linear-gradient(150deg,#f59e0b,#f97316)', bad: 'linear-gradient(150deg,#ef4444,#ec4899)' };
    function paint() { const r = A.readiness(); if (!r) { card.replaceChildren(h('h2', {}, 'Is my internet good enough for...'), h('div', { class: 'small mute' }, 'Collecting data. Run a speed test to see which activities work well.'), h('button', { class: 'sm', style: 'margin-top:10px', onclick: () => A.go('speed') }, 'Test my speed')); return; }
      const stars = Math.round(r.mos * 10) / 10;
      card.replaceChildren(h('h2', {}, 'Is my internet good enough for...'),
        h('div', { class: 'row', style: 'margin-bottom:12px;padding:12px;border-radius:16px;background:var(--panel2);border:1px solid var(--glass-line)' }, h('div', { class: 'head ' + r.lv[1], style: 'font-size:34px;font-weight:800' }, stars.toFixed(1)), h('div', {}, h('b', {}, 'Call quality: ' + r.lv[0]), h('div', { class: 'xs mute' }, 'Score out of 5 from your delay, jitter and loss (the industry MOS scale, 4.5 is the practical best).'))),
        r.items.map(([ic, t, tone, note]) => h('div', { class: 'row', style: 'padding:8px 0;border-top:1px solid var(--glass-line)' }, h('div', { class: 'ic sm', style: `background:${col[tone]}`, html: Icons.svg(ic) }), h('div', { class: 'grow' }, h('div', { style: 'font-weight:600;font-size:14px' }, t), h('div', { class: 'xs mute' }, note)), pill(tone === 'good' ? 'GOOD' : tone === 'warn' ? 'OK' : 'POOR', tone))));
    }
    paint(); A.every(4000, paint); return card;
  };

  /* ---------- outage check ---------- */
  const SVC = [
    ['Gaming', 'Xbox Live', 'https://login.live.com', null, 'xbox-live'], ['Gaming', 'PlayStation Network', 'https://www.playstation.com', null, 'playstation-network'], ['Gaming', 'Steam', 'https://store.steampowered.com', null, 'steam'],
    ['Gaming', 'Fortnite / Epic', 'https://www.epicgames.com', 'https://status.epicgames.com/api/v2/summary.json', 'fortnite'], ['Gaming', 'Roblox', 'https://www.roblox.com', 'https://status.roblox.com/api/v2/summary.json', 'roblox'], ['Gaming', 'Discord', 'https://discord.com', 'https://discordstatus.com/api/v2/summary.json', 'discord'],
    ['Streaming', 'Netflix', 'https://www.netflix.com', null, 'netflix'], ['Streaming', 'YouTube', 'https://www.youtube.com', null, 'youtube'], ['Streaming', 'Disney+', 'https://www.disneyplus.com', null, null], ['Streaming', 'Spotify', 'https://open.spotify.com', null, 'spotify'], ['Streaming', 'Twitch', 'https://www.twitch.tv', 'https://status.twitch.tv/api/v2/summary.json', 'twitch'],
    ['Work and web', 'Zoom', 'https://zoom.us', 'https://status.zoom.us/api/v2/summary.json', 'zoom'], ['Work and web', 'Microsoft 365', 'https://www.office.com', null, null], ['Work and web', 'Google', 'https://www.google.com', null, 'google'], ['Work and web', 'Cloudflare', 'https://www.cloudflare.com', 'https://www.cloudflarestatus.com/api/v2/summary.json', null], ['Work and web', 'GitHub', 'https://github.com', 'https://www.githubstatus.com/api/v2/summary.json', null],
    ['Internet and phone providers', 'Spectrum', 'https://www.spectrum.com', null, 'spectrum'], ['Internet and phone providers', 'Xfinity', 'https://www.xfinity.com', null, 'xfinity'], ['Internet and phone providers', 'AT&T', 'https://www.att.com', null, 'att'], ['Internet and phone providers', 'Verizon', 'https://www.verizon.com', null, 'verizon'], ['Internet and phone providers', 'T-Mobile', 'https://www.t-mobile.com', null, 't-mobile']
  ].map(([g, n, probe, sp, dd]) => ({ g, n, probe, sp, dd }));
  async function probeSvc(s) {
    for (let a = 0; a < 2; a++) { const ac = new AbortController(), to = setTimeout(() => ac.abort(), 7000), t = performance.now(); try { await fetch(s.probe + '/?r=' + Math.random().toString(36).slice(2), { mode: 'no-cors', cache: 'no-store', signal: ac.signal }); clearTimeout(to); return { ms: performance.now() - t, ok: true }; } catch (e) { clearTimeout(to); } }
    return { ms: 0, ok: false };
  }
  async function officialSvc(s) {
    if (!s.sp) return null; const ac = new AbortController(), to = setTimeout(() => ac.abort(), 7000);
    try { const j = await (await fetch(s.sp, { signal: ac.signal, cache: 'no-store' })).json(); clearTimeout(to); const ind = j.status && j.status.indicator; return { ind, text: j.status && j.status.description, inc: (j.incidents || [])[0] && j.incidents[0].name }; } catch (e) { clearTimeout(to); return null; }
  }
  A.views.outage = function (root) {
    const bar = h('div', { class: 'row sp', style: 'margin-bottom:12px' }, h('button', { class: 'sm ghost', onclick: () => A.go(A.adv() ? 'tools' : 'home') }, 'Back'), h('span', { class: 'xs mute' }, 'From your connection, right now'));
    const top = A.card(null), list = h('div', {}); let only = false, busy = false; root.append(bar, top, list);
    const R = A.ctx.outage = A.ctx.outage || { res: {}, at: 0 };
    const tone = r => !r ? 'mute' : !r.probe.ok ? 'bad' : (r.off && ['major', 'critical'].includes(r.off.ind)) ? 'bad' : (r.off && r.off.ind === 'minor') || r.probe.ms > 2000 ? 'warn' : 'good';
    function paint() {
      const rows = SVC.map(s => ({ s, r: R.res[s.n] })), done = rows.filter(x => x.r), bad = done.filter(x => tone(x.r) === 'bad'), warn = done.filter(x => tone(x.r) === 'warn'), okc = done.filter(x => tone(x.r) === 'good').length;
      const base = ['Google', 'Cloudflare'].map(n => R.res[n]).filter(Boolean), netDown = base.length === 2 && base.every(r => !r.probe.ok);
      let msg, sev = 0; if (!done.length) msg = 'Tap Check now to test every service from your connection.'; else if (netDown) { msg = 'Your internet connection looks down. This is not a service outage.'; sev = 2; } else if (bad.length) { msg = `${bad.map(x => x.s.n).join(', ')} ${bad.length === 1 ? 'is' : 'are'} not responding from here, while the rest of the internet works. ${bad.some(x => x.r.off && ['major', 'critical'].includes(x.r.off.ind)) ? 'The official status page agrees.' : 'It could be their outage, or a block on your network.'}`; sev = 1; } else if (warn.length) msg = `${warn.map(x => x.s.n).join(', ')} ${warn.length === 1 ? 'is' : 'are'} slow or reporting minor problems.`; else msg = 'Everything checked is reachable.';
      top.replaceChildren(h('div', { class: 'row wrap', style: 'gap:16px;justify-content:center' }, Ch.ring(done.length ? Math.round(okc / done.length * 100) : 0, { size: 120, label: done.length ? `${okc}/${done.length} up` : 'Not checked', tone: sev === 2 ? 'bad' : sev === 1 ? 'warn' : 'good' }), h('div', { class: 'grow', style: 'min-width:190px' }, h('div', { class: 'head', style: 'font-weight:800;font-size:17px' }, 'Service check'), h('div', { class: 'small', style: 'margin-top:4px' }, msg), h('div', { class: 'row wrap', style: 'margin-top:10px' }, h('button', { class: 'sm', disabled: busy, onclick: run }, busy ? 'Checking...' : done.length ? 'Check again' : 'Check now'), h('button', { class: 'sm ghost', onclick: () => { only = !only; paint(); } }, only ? 'Show all' : 'Only problems'))), R.at ? h('div', { class: 'xs mute', style: 'width:100%;text-align:center' }, 'Checked ' + new Date(R.at).toLocaleTimeString()) : null));
      list.replaceChildren(...[...new Set(SVC.map(s => s.g))].map(g => { const items = rows.filter(x => x.s.g === g && (!only || ['bad', 'warn'].includes(tone(x.r)))); if (!items.length) return null;
        return A.card(g, items.map(({ s, r }) => { const t = tone(r), dd = s.dd ? `https://downdetector.com/status/${s.dd}/` : null;
          return h('div', { class: 'row', style: 'padding:9px 0;border-top:1px solid var(--glass-line)' }, h('i', { style: `width:12px;height:12px;border-radius:50%;flex:none;background:var(--${t === 'mute' ? 'panel2' : t});box-shadow:0 0 0 3px color-mix(in srgb,var(--${t === 'mute' ? 'mute' : t}) 25%,transparent)` }),
            h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, s.n), h('div', { class: 'xs mute' }, !r ? (busy ? 'checking...' : 'not checked') : !r.probe.ok ? 'Not responding from your connection' : A.adv() ? `Reachable, ${Math.round(r.probe.ms)} ms` : r.probe.ms > 2000 ? 'Slow to respond' : 'Reachable'), r && r.off && r.off.ind && r.off.ind !== 'none' ? h('div', { class: 'xs ' + (['major', 'critical'].includes(r.off.ind) ? 'bad' : 'warn') }, 'Official: ' + (r.off.inc || r.off.text)) : r && r.off ? h('div', { class: 'xs good' }, 'Official status: all systems operational') : null),
            dd ? h('a', { href: dd, target: '_blank', rel: 'noopener', class: 'small', style: 'color:var(--acc);text-decoration:none;font-weight:600' }, 'Reports') : null); }), g === 'Internet and phone providers' ? h('div', { class: 'xs mute', style: 'margin-top:8px' }, 'Providers do not publish public status feeds. "Not responding" here means their website is unreachable from you; for a real area outage, open Reports or call them.') : null); }));
    }
    async function run() {
      if (busy) return; busy = true; R.res = {}; paint(); let i = 0;
      await Promise.all(Array.from({ length: 8 }, async () => { while (i < SVC.length) { const s = SVC[i++]; const [probe, off] = await Promise.all([probeSvc(s), officialSvc(s)]); R.res[s.n] = { probe, off }; if (A.tab === 'outage') paint(); } }));
      busy = false; R.at = Date.now(); if (A.tab === 'outage') paint();
      const down = SVC.filter(s => R.res[s.n] && !R.res[s.n].probe.ok).map(s => s.n); if (down.length && down.length < SVC.length / 2) A.log({ t: Date.now(), kind: 'outage', source: 'Services', sev: 1, msg: `Not reachable: ${down.join(', ')}` });
    }
    paint(); if (!R.at || Date.now() - R.at > 300000) run();
  };

  /* ---------- Windows app tools ---------- */
  const pc = fn => function (...a) { if (!N.isDesktop) return winOnly(fn.what); return fn.apply(null, a); };
  const mk = (what, f) => { f.what = what; return pc(f); };
  T.adapters = mk('Network adapter details', async function () {
    const body = h('div', { class: 'small mute' }, 'Reading adapters...'); let sh; sh = A.sheet([head('Network adapters', () => sh), body]);
    try { const r = await N.call('adapters'); body.replaceChildren(r.adapters.map(a => h('div', { class: 'card', style: 'margin:0 0 10px' }, h('div', { class: 'row' }, h('div', { class: 'ic sm', html: Icons.svg(/wi-?fi|wireless|wlan/i.test(a.name) ? 'wifi' : 'router') }), h('div', { class: 'grow' }, h('b', {}, a.name), h('div', { class: 'xs mute' }, a.desc || '')), a.status ? pill(a.status, /up/i.test(a.status) ? 'good' : 'warn') : null),
      h('div', { class: 'small', style: 'margin-top:8px;line-height:1.7' }, a.ipv4 ? h('div', {}, 'IPv4  ', h('b', {}, a.ipv4 + (a.mask ? ' / ' + a.mask : ''))) : null, a.mac ? h('div', {}, 'MAC  ', h('b', {}, a.mac)) : null, a.speed ? h('div', {}, 'Speed  ', h('b', {}, a.speed)) : null))), h('div', { class: 'small mute' }, `Default gateway ${r.gateway || '-'} | DNS ${(r.dns || []).join(', ') || '-'}`)); } catch (e) { body.replaceChildren(h('div', { class: 'bad' }, e.message)); }
  });
  T.connections = mk('The live connections list', async function () {
    const body = h('div', { class: 'small mute' }, 'Reading connections...'); let sh, filt = 'ESTABLISHED'; sh = A.sheet([head('Active connections', () => sh), body]);
    async function load() { try { const r = await N.call('connections'), all = r.connections, st = {}; all.forEach(c => { const k = c.state || 'UDP'; st[k] = (st[k] || 0) + 1; });
      const cols = { ESTABLISHED: Ch.css('good'), LISTENING: Ch.css('acc'), TIME_WAIT: Ch.css('warn'), UDP: Ch.css('info') }, data = Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ label: k.replace('_', ' ').toLowerCase(), value: v, color: cols[k] || '#94a3b8' }));
      const rows = all.filter(c => filt === 'ALL' || (filt === 'UDP' ? c.proto === 'UDP' : c.state === filt)).filter(c => !/^(127\.|\[::1\]|0\.0\.0\.0|\[::\])/.test(c.remote) || filt !== 'ESTABLISHED'), byProc = {}; rows.forEach(c => { byProc[c.proc || 'PID ' + c.pid] = (byProc[c.proc || 'PID ' + c.pid] || 0) + 1; });
      const top = Object.entries(byProc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v], i) => ({ label: k, value: v, color: `hsl(${i * 50 + 200} 70% 55%)`, text: String(v) }));
      body.replaceChildren(Ch.donutCard(data, { size: 120, big: all.length, small: 'total' }), h('div', { class: 'chips', style: 'margin:12px 0' }, ['ESTABLISHED', 'LISTENING', 'UDP', 'ALL'].map(f => h('span', { class: 'chip' + (f === filt ? ' on' : ''), onclick: () => { filt = f; load(); } }, f.toLowerCase()))), U.hbars(top, 130), h('div', { style: 'margin-top:10px;max-height:340px;overflow:auto' }, rows.slice(0, 150).map(c => h('div', { class: 'row sp', style: 'padding:6px 0;border-top:1px solid var(--glass-line)' }, h('div', {}, h('b', { class: 'small' }, c.proc || 'PID ' + c.pid), h('div', { class: 'xs mute' }, c.local + '  >  ' + c.remote)), pill(c.state || c.proto)))), h('button', { class: 'sm ghost', style: 'margin-top:10px', onclick: load }, 'Refresh')); } catch (e) { body.replaceChildren(h('div', { class: 'bad' }, e.message)); } }
    load();
  });
  T.fixes = mk('Network repair buttons', function () {
    const out = h('pre', { class: 'small', style: 'white-space:pre-wrap;margin-top:10px' }); let sh; const run = (m, ask) => async () => { if (ask && !confirm(ask)) return; out.textContent = 'Working...'; try { const r = await N.call(m); out.textContent = (r.ok ? 'Done.\n' : 'Problem:\n') + (r.out || ''); } catch (e) { out.textContent = e.message; } };
    sh = A.sheet([head('Quick fixes', () => sh), h('div', { class: 'small mute', style: 'margin-bottom:10px' }, 'Common repairs a tech would run from the command line.'), h('div', { class: 'col' }, h('button', { onclick: run('flushDns') }, 'Flush DNS cache'), h('div', { class: 'xs mute' }, 'Clears stored name lookups. Fixes sites that will not load after a change.'), h('button', { class: 'ghost', onclick: run('renewIp', 'Renew the IP address? The connection may drop for a few seconds.') }, 'Renew IP address'), h('div', { class: 'xs mute' }, 'Asks the router for a fresh address. Fixes "limited connectivity" after moving networks.')), out]);
  });
  T.wlanreport = mk('The Windows Wi-Fi history report', async function () {
    A.toast('Building the Windows Wi-Fi report...'); try { const r = await N.call('wlanReport'); A.toast(r.ok ? 'Opened the report' : r.out); if (!r.ok) A.sheet([h('div', { class: 'find s1' }, h('b', {}, 'Could not build the report'), h('div', { class: 'why' }, r.out))]); } catch (e) { A.toast(e.message); }
  });
  T.wol = mk('Wake-on-LAN', function () {
    const mac = h('input', { placeholder: 'aa:bb:cc:dd:ee:ff', autocapitalize: 'none' }), out = h('div', { class: 'small', style: 'margin-top:10px' }); let sh; const devs = (A.ctx.devices || []).filter(d => d.mac);
    sh = A.sheet([head('Wake-on-LAN', () => sh), h('div', { class: 'small mute', style: 'margin-bottom:8px' }, 'Sends the "magic packet" that turns on a sleeping PC or NAS. The device must have Wake-on-LAN enabled in its BIOS and network settings.'), devs.length ? h('div', { class: 'chips', style: 'margin-bottom:8px' }, devs.map(d => h('span', { class: 'chip', onclick: () => { mac.value = d.mac; } }, d.name || d.ip))) : null, mac, h('button', { style: 'margin-top:10px', onclick: async () => { try { const r = await N.call('wol', { mac: mac.value }); out.className = 'small good'; out.textContent = 'Sent to ' + r.sent.join(', '); } catch (e) { out.className = 'small bad'; out.textContent = e.message; } } }, 'Wake it up'), out]);
  });
  T.mtu = mk('The MTU test', function () {
    const host = h('input', { value: '1.1.1.1' }), out = h('div', {}); let sh;
    const go = h('button', { onclick: async () => { go.disabled = true; out.replaceChildren(h('div', { class: 'small mute', style: 'margin-top:10px' }, 'Testing packet sizes...')); try { const r = await N.call('mtuTest', { host: host.value.trim() }); const tone = !r.mtu ? 'bad' : r.mtu >= 1500 ? 'good' : r.mtu >= 1400 ? 'warn' : 'bad';
      out.replaceChildren(r.mtu ? h('div', { style: 'margin-top:12px' }, h('div', { class: 'row', style: 'justify-content:center;gap:14px' }, h('div', { class: 'head ' + tone, style: 'font-size:46px;font-weight:800' }, r.mtu), h('div', { class: 'small mute' }, 'largest packet that gets through', h('br'), '(standard is 1500)')), U.meter('Path MTU', r.mtu, 1280, 1500, 1492, 1500, 'bytes'), h('div', { class: 'small' }, r.mtu >= 1492 ? 'Normal. No fragmentation problems.' : 'Lower than normal. A VPN, PPPoE line or tunnel is shrinking packets. Setting the router MTU to this value can fix slow or stalling websites.')) : h('div', { class: 'find s1', style: 'margin-top:10px' }, h('b', {}, r.note || 'No answer'))); } catch (e) { out.replaceChildren(h('div', { class: 'bad' }, e.message)); } go.disabled = false; } }, 'Find MTU');
    sh = A.sheet([head('MTU test', () => sh), host, h('div', { style: 'margin-top:10px' }, go), out]);
  });

  /* ---------- register in the Tools tab ---------- */
  const add = (...t) => A.TILES.push(t);
  add('globe', 'Outage check', 'Is it them or me?', () => A.go('outage'), 'Net');
  add('trace', 'Ping tester', 'Latency graph and loss', () => T.ping(), 'Net'); add('router', 'My connection', 'IP, ISP, IPv6, CGNAT', () => T.myconn(), 'Net'); add('dns', 'DNS lookup', 'A, MX, TXT, NS', () => T.dnslookup(), 'Net');
  add('gear', 'Subnet calculator', 'Masks and ranges', () => T.subnet(), 'Net'); add('hub', 'MAC lookup', 'Who made this device', () => T.maclookup(), 'Net'); add('check', 'Captive portal', 'Sign-in page blocking?', () => T.captive(), 'Net');
  add('pc', 'Network adapters', 'IP, MAC, speed, DNS', () => T.adapters(), 'PC', 'Windows app tools', 'Only in the ARC Signal Windows app'); add('bolt', 'Connections', 'Who is my PC talking to', () => T.connections(), 'PC'); add('gear', 'Quick fixes', 'Flush DNS, renew IP', () => T.fixes(), 'PC'); add('report', 'Wi-Fi history report', 'Windows WLAN report', () => T.wlanreport(), 'PC'); add('power', 'Wake-on-LAN', 'Turn on a sleeping PC', () => T.wol(), 'PC'); add('port', 'MTU test', 'Find packet size limits', () => T.mtu(), 'PC');
  A.boot();
})();
