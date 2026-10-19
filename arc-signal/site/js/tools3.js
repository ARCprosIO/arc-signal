/* ARC Signal - planning tools that work everywhere (no scan needed): Wi-Fi QR code, bandwidth planner, node planner. */
(function () {
  'use strict';
  const A = window.App, C = window.Core, Ch = window.Charts, h = A.h, T = A.tools;
  const head = (t, sh) => h('div', { class: 'row sp', style: 'margin-bottom:10px' }, h('b', { class: 'head', style: 'font-size:18px' }, t), h('button', { class: 'sm ghost', onclick: () => sh().close() }, 'Close'));
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };

  /* ================= Wi-Fi QR code ================= */
  T.wifiqr = function () {
    const w = A.ctx.wifi || {}; let sh;
    const ssid = h('input', { value: w.ssid && w.ssid !== '(hidden)' ? w.ssid : '', placeholder: 'Network name (SSID)', autocapitalize: 'none', autocomplete: 'off' });
    const pw = h('input', { type: 'password', placeholder: 'Wi-Fi password', autocapitalize: 'none', autocomplete: 'off' });
    const sec = h('select', {}, [['WPA', 'WPA / WPA2 / WPA3 (most networks)'], ['WEP', 'WEP (old)'], ['nopass', 'No password (open)']].map(([v, l]) => h('option', { value: v }, l)));
    const hid = h('input', { type: 'checkbox', style: '' }), show = h('input', { type: 'checkbox', style: '', onchange: () => { pw.type = show.checked ? 'text' : 'password'; } });
    const cv = h('canvas', { style: 'width:240px;height:240px;border-radius:14px;background:#fff;box-shadow:0 8px 24px -10px rgba(0,0,0,.4)' }), msg = h('div', { class: 'small mute', style: 'text-align:center;margin-top:10px' }), dl = h('a', { class: 'btn sm', style: 'display:none', download: 'wifi-qr.png' }, 'Save as picture');
    const esc = s => s.replace(/([\\;,:"])/g, '\\$1');
    function draw() {
      const g = cv.getContext('2d'); cv.width = cv.height = 480; g.fillStyle = '#fff'; g.fillRect(0, 0, 480, 480); dl.style.display = 'none';
      if (!ssid.value.trim()) { msg.textContent = 'Type the network name to make the code.'; return; }
      if (sec.value !== 'nopass' && !pw.value) { msg.textContent = 'Type the password to make the code.'; return; }
      try {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
        const q = qrcode(0, 'M'); q.addData(`WIFI:T:${sec.value};S:${esc(ssid.value)};${sec.value === 'nopass' ? '' : 'P:' + esc(pw.value) + ';'}${hid.checked ? 'H:true;' : ''};`); q.make();
        const n = q.getModuleCount(), cell = Math.floor(440 / n), off = Math.floor((480 - cell * n) / 2); g.fillStyle = '#0b1220';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(off + c * cell, off + r * cell, cell, cell);
        msg.textContent = 'Point a phone camera at this. It offers to join "' + ssid.value + '" with one tap.'; dl.href = cv.toDataURL('image/png'); dl.style.display = '';
      } catch (e) { msg.textContent = 'That is too long for a QR code. Try a shorter password or name.'; }
    }
    [ssid, pw, sec, hid].forEach(x => { x.oninput = draw; x.onchange = draw; });
    sh = A.sheet([head('Wi-Fi QR code', () => sh), h('div', { class: 'small mute', style: 'margin-bottom:12px' }, 'Guests scan this instead of typing a long password. Handy for customers, the guest network, or a printed card by the router.'),
      h('label', {}, 'Network name'), ssid, h('label', {}, 'Password'), pw, h('label', { class: 'small', style: 'display:flex;align-items:center;margin:6px 0' }, show, 'Show password'), h('label', {}, 'Security'), sec,
      h('label', { class: 'small', style: 'display:flex;align-items:center;margin:8px 0' }, hid, 'This is a hidden network'),
      h('div', { style: 'display:flex;flex-direction:column;align-items:center;margin-top:14px' }, cv, msg, h('div', { style: 'margin-top:10px' }, dl)),
      h('div', { class: 'xs mute', style: 'margin-top:12px' }, 'Made on this device only. The name and password are not saved or sent anywhere.')]); draw();
  };

  /* ================= Bandwidth planner ================= */
  const ACT = [['4K streaming', 'tv', 25, 0, '#8b5cf6'], ['HD streaming', 'tv', 5, 0, '#3b82f6'], ['Video calls', 'phone', 3, 3, '#14b8a6'], ['Online gaming', 'game', 5, 1, '#f59e0b'], ['Work from home / VPN', 'laptop', 10, 5, '#0ea5e9'], ['Security cameras (cloud)', 'camera', 0.5, 4, '#ec4899'], ['Music and podcasts', 'speaker', 0.3, 0, '#22c55e'], ['Smart-home gadgets', 'iot', 0.1, 0.05, '#94a3b8']];
  const PLANS_D = [50, 100, 200, 300, 500, 1000, 2000], PLANS_U = [5, 10, 20, 35, 50, 100, 300, 1000];
  T.planner = function () {
    let sh; const st = A.store.get('bwplan', { n: [1, 2, 1, 0, 0, 0, 2, 10], big: false });
    const out = h('div', {}), rows = h('div', {}), have = A.ctx.lastSpeed || A.store.get('speedhist', [])[0];
    const need = () => { let d = 0, u = 0; const parts = ACT.map((a, i) => { const dd = a[2] * st.n[i], uu = a[3] * st.n[i]; d += dd; u += uu; return { a, dd, uu }; }); if (st.big) d += 50; return { d: d * 1.25, u: u * 1.25, parts }; };
    const pick = (v, list) => list.find(p => p >= v) || list[list.length - 1];
    function paint() {
      A.store.set('bwplan', st); const { d, u, parts } = need(), pd = pick(d, PLANS_D), pu = pick(u, PLANS_U);
      const total = parts.reduce((s, p) => s + p.dd, 0) + (st.big ? 50 : 0) || 1;
      const stack = h('div', { style: 'display:flex;height:20px;border-radius:10px;overflow:hidden;background:var(--panel2);margin:6px 0' }, parts.filter(p => p.dd > 0).map(p => h('i', { title: p.a[0], style: `width:${p.dd / total * 100}%;background:${p.a[4]}` })), st.big ? h('i', { title: 'Big download', style: `width:${50 / total * 100}%;background:#ef4444` }) : null);
      const cmp = (label, haveV, needV) => { if (haveV == null) return null; const ratio = haveV / Math.max(0.1, needV), tone = ratio >= 1.2 ? 'good' : ratio >= 1 ? 'warn' : 'bad'; return h('div', { style: 'margin-top:12px' }, h('div', { class: 'row sp small' }, h('b', {}, label), h('span', { class: tone }, ratio >= 1.2 ? 'Plenty' : ratio >= 1 ? 'Just enough' : 'Not enough')),
        h('div', { class: 'bar', style: 'height:10px;margin:4px 0' }, h('i', { style: `width:${Math.min(100, ratio * 50)}%;background:var(--${tone})` })), h('div', { class: 'xs mute' }, `Your last test: ${C.fmt.mbps(haveV)} Mbps. This household needs about ${Math.round(needV)}.`)); };
      out.replaceChildren(h('div', { class: 'card', style: 'margin:12px 0;background:linear-gradient(135deg,var(--acc2),var(--acc));color:#fff' }, h('div', { class: 'xs', style: 'opacity:.85' }, 'Plan to look for'), h('div', { class: 'row sp', style: 'align-items:flex-end' }, h('div', {}, h('b', { class: 'head', style: 'font-size:34px' }, pd), h('span', { class: 'small' }, ' Mbps down')), h('div', {}, h('b', { class: 'head', style: 'font-size:24px' }, pu), h('span', { class: 'small' }, ' Mbps up'))),
        h('div', { class: 'xs', style: 'opacity:.85;margin-top:6px' }, `Busy-evening need: about ${Math.round(d)} down, ${Math.round(u * 10) / 10} up, including 25% headroom.`)),
        h('div', { class: 'small', style: 'font-weight:700' }, 'Where the speed goes'), stack, h('div', { class: 'legend' }, parts.filter(p => p.dd > 0).map(p => h('div', { class: 'li' }, h('i', { style: `background:${p.a[4]}` }), `${p.a[0]} ${Math.round(p.dd)}`))),
        have ? [cmp('Download', have.down, d), cmp('Upload', have.up, u)] : h('div', { class: 'small mute', style: 'margin-top:12px' }, 'Run a speed test to see whether your line is enough.'),
        h('div', { class: 'xs mute', style: 'margin-top:12px' }, 'Planning numbers are typical rates (4K stream about 25 Mbps, HD 5, a video call 3 each way). They add up because devices share the line at the same moment. Wi-Fi quality matters too: a fast plan does not fix a weak signal.'));
    }
    const stepper = (i, a) => h('div', { class: 'row', style: 'padding:8px 0;border-top:1px solid var(--glass-line)' }, h('div', { class: 'ic sm', style: `background:${a[4]}`, html: Icons.svg(a[1]) }), h('div', { class: 'grow' }, h('b', { class: 'small' }, a[0]), h('div', { class: 'xs mute' }, `${a[2]} down${a[3] ? ', ' + a[3] + ' up' : ''} each`)),
      h('button', { class: 'sm ghost', 'aria-label': 'fewer', onclick: () => { st.n[i] = Math.max(0, st.n[i] - 1); cnt[i].textContent = st.n[i]; paint(); } }, '-'), h('b', { style: 'min-width:28px;text-align:center' }, cnt[i] = h('span', {}, st.n[i])), h('button', { class: 'sm', 'aria-label': 'more', onclick: () => { st.n[i] = Math.min(40, st.n[i] + 1); cnt[i].textContent = st.n[i]; paint(); } }, '+'));
    const cnt = [];
    rows.append(...ACT.map((a, i) => stepper(i, a)), h('label', { class: 'small', style: 'display:flex;align-items:center;margin-top:10px' }, h('input', { type: 'checkbox', style: '', checked: st.big, onchange: e => { st.big = e.target.checked; paint(); } }, ''), 'Someone downloads big files or game updates at the same time'));
    sh = A.sheet([head('How much speed do I need?', () => sh), h('div', { class: 'small mute', style: 'margin-bottom:6px' }, 'Count what runs at the same time in the busiest hour. We add it up and compare it to your line.'), rows, out]); paint();
  };

  /* ================= Node / mesh planner ================= */
  const WALLS = [['Open plan and drywall', 1800], ['Plaster and lath, older house', 1200], ['Brick, block or concrete', 800]];
  T.nodeplan = function () {
    let sh; const st = A.store.get('nodeplan', { sqft: 2400, floors: 2, wall: 0, wired: false });
    const sq = h('input', { type: 'number', inputmode: 'numeric', value: st.sqft, min: 300, max: 20000 }), fl = h('select', {}, [1, 2, 3].map(n => h('option', { value: n, selected: n === st.floors }, n + (n === 1 ? ' floor' : ' floors')))), wl = h('select', {}, WALLS.map(([l], i) => h('option', { value: i, selected: i === st.wall }, l))), wd = h('input', { type: 'checkbox', style: '', checked: st.wired }), out = h('div', {});
    function plan() {
      st.sqft = Math.max(300, Math.min(20000, num(sq.value, 2000))); st.floors = +fl.value; st.wall = +wl.value; st.wired = wd.checked; A.store.set('nodeplan', st);
      const cov = WALLS[st.wall][1], per = st.sqft / st.floors, perFloor = Math.max(1, Math.ceil(per / cov));
      let nodes = perFloor * st.floors; if (st.floors > 1 && st.wall < 2) nodes = Math.max(st.floors, Math.ceil(nodes * 0.85)); nodes = Math.min(nodes, 10);
      const floorsN = Array.from({ length: st.floors }, (_, f) => Math.max(1, Math.round(nodes / st.floors) + (f < nodes % st.floors && nodes % st.floors ? 0 : 0)));
      let sum = floorsN.reduce((a, b) => a + b, 0); for (let f = 0; sum < nodes; f = (f + 1) % st.floors) { floorsN[f]++; sum++; } for (let f = st.floors - 1; sum > nodes && f >= 0; f--) if (floorsN[f] > 1) { floorsN[f]--; sum--; }
      const diagram = floorsN.map((n, f) => { const dots = Array.from({ length: n }, (_, i) => { const x = (i + 0.5) / n * 100, main = f === 0 && i === 0; return `<g transform="translate(${(x * 3).toFixed(1)},48)"><circle r="30" fill="${main ? '#3b82f6' : '#14b8a6'}" opacity=".13"/><circle r="19" fill="${main ? '#3b82f6' : '#14b8a6'}" opacity=".2"/><circle r="9" fill="${main ? '#2563eb' : '#0d9488'}"/><text y="30" text-anchor="middle" font-size="9" fill="currentColor" opacity=".7">${main ? 'router' : 'node'}</text></g>`; }).join('');
        return h('div', { style: 'margin:8px 0' }, h('div', { class: 'xs mute' }, st.floors === 1 ? 'Floor plan' : `Floor ${st.floors - f}`.replace(/Floor \d/, 'Floor ' + (f + 1))), h('div', { html: `<svg viewBox="0 0 300 96" width="100%" style="background:var(--panel2);border-radius:12px;border:1px solid var(--glass-line)">${dots}</svg>` })); });
      const tips = [['Put nodes where the signal is still good, about one or two walls from the router. A node that sits where the signal is already weak only repeats a weak signal.', ''], ['Hallways and open central spots beat closets, cabinets and the floor behind a TV.', ''], st.wired ? ['Wired links between nodes (Ethernet) are the best setup: every node gets full speed.', 'good'] : ['Wireless links between nodes lose speed with each hop. If you can run Ethernet to even one node, do it. A tri-band system hides most of this loss.', 'warn'], st.wall === 2 ? ['Brick and concrete block Wi-Fi hard. Plan a node in every area you care about, wired if possible.', 'warn'] : ['After setting up, walk the house with the Roam walk test in the Android app and add a node only where the signal drops.', '']];
      out.replaceChildren(h('div', { class: 'card', style: 'margin:12px 0;background:linear-gradient(135deg,#14b8a6,#3b82f6);color:#fff' }, h('div', { class: 'xs', style: 'opacity:.85' }, 'Starting point'), h('div', {}, h('b', { class: 'head', style: 'font-size:40px' }, nodes), h('span', { class: 'small' }, nodes === 1 ? ' router covers it' : ' units (router + ' + (nodes - 1) + (nodes === 2 ? ' node)' : ' nodes)'))), h('div', { class: 'xs', style: 'opacity:.9;margin-top:4px' }, `About ${Math.round(per)} sq ft per floor. One unit covers roughly ${cov.toLocaleString()} sq ft with these walls.`)),
        diagram, h('div', { class: 'col small', style: 'margin-top:10px;gap:8px' }, tips.map(([t, tone]) => h('div', { class: 'row', style: 'align-items:flex-start' }, h('span', { class: tone || 'info' }, tone === 'warn' ? '!' : tone === 'good' ? '✓' : '•'), h('div', {}, t)))),
        h('div', { class: 'xs mute', style: 'margin-top:10px' }, 'A rule-of-thumb estimate, not a survey. Real coverage depends on materials, the equipment and neighbors. Confirm with a walk test.'));
    }
    [sq, fl, wl, wd].forEach(x => { x.oninput = plan; x.onchange = plan; });
    sh = A.sheet([head('How many Wi-Fi units do I need?', () => sh), h('label', {}, 'Total living space (sq ft)'), sq, h('label', {}, 'Floors'), fl, h('label', {}, 'Walls and building'), wl, h('label', { class: 'small', style: 'display:flex;align-items:center;margin:10px 0' }, wd, 'I can run Ethernet cable between units'), out]); plan();
  };

  /* ---------- register ---------- */
  const add = (...t) => A.TILES.push(t);
  add('wifi', 'Wi-Fi QR code', 'Guests scan to join', () => T.wifiqr(), 'Wi');
  add('mesh', 'Node planner', 'How many units for this home', () => T.nodeplan(), 'Wi');
  add('bolt', 'Speed I need', 'Add up the household', () => T.planner(), 'Net');
})();
