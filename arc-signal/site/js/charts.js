/* ARC Signal charts: glass donuts, score rings, band/channel map, radar, RSSI timeline. */
(function (root) {
  'use strict';
  const Ch = {};
  let uid = 0; const id = p => p + (++uid);
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const el = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();
  Ch.css = css;

  /* colour per SSID (stable) */
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); };
  Ch.hash = hash;
  const HUES = [211, 152, 28, 340, 265, 178, 48, 0, 300, 120, 195, 80];
  const seen = new Map();
  Ch.ssidColor = ssid => {
    if (!ssid) return 'hsl(215 12% 58%)';
    if (!seen.has(ssid)) seen.set(ssid, seen.size);
    const i = seen.get(ssid), hue = HUES[i % HUES.length] + Math.floor(i / HUES.length) * 17;
    return `hsl(${hue} 76% 55%)`;
  };
  Ch.resetColors = () => seen.clear();

  /* ---------- glass donut ---------- */
  function arc(cx, cy, r0, r1, a0, a1) {
    if (a1 - a0 >= Math.PI * 2 - 0.001) a1 = a0 + Math.PI * 2 - 0.002;
    const lg = a1 - a0 > Math.PI ? 1 : 0, p = (r, a) => [(cx + r * Math.cos(a)).toFixed(2), (cy + r * Math.sin(a)).toFixed(2)];
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    return `M${x0} ${y0}A${r1} ${r1} 0 ${lg} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${lg} 0 ${x3} ${y3}Z`;
  }
  /* data: [{label,value,color}] ; opts: {size, thick, big, small, onPick} */
  Ch.donut = function (data, o) {
    o = o || {}; const S = o.size || 170, cx = S / 2, cy = S / 2, R = S / 2 - 8, r0 = R * (o.thick || 0.62);
    const tot = data.reduce((s, d) => s + d.value, 0) || 1, gid = id('dg'), fid = id('df');
    let a = -Math.PI / 2, defs = '', paths = '';
    const items = data.filter(d => d.value > 0);
    items.forEach((d, i) => {
      const sweep = d.value / tot * Math.PI * 2, gap = items.length > 1 ? 0.045 : 0, a0 = a + gap / 2, a1 = a + sweep - gap / 2; a += sweep;
      defs += `<linearGradient id="${gid}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="color-mix(in srgb,${d.color} 62%,#fff)"/><stop offset=".55" stop-color="${d.color}"/><stop offset="1" stop-color="color-mix(in srgb,${d.color} 72%,#000)"/></linearGradient>`;
      paths += `<path d="${arc(cx, cy, r0, R, a0, a1)}" fill="url(#${gid}${i})" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-linejoin="round" data-i="${i}" style="cursor:pointer"><title>${esc(d.label)}: ${d.value}</title></path>`;
    });
    const svg = el(`<svg class="chart" viewBox="0 0 ${S} ${S}" style="max-width:${S}px;height:auto;margin:auto"><defs>${defs}<filter id="${fid}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".28"/></filter>
      <radialGradient id="${gid}c" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="${css('glass1')}"/><stop offset="1" stop-color="${css('glass2')}"/></radialGradient></defs>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="rgba(0,0,0,.05)" />
      <g filter="url(#${fid})">${paths || `<circle cx="${cx}" cy="${cy}" r="${(R + r0) / 2}" fill="none" stroke="${css('glass-line')}" stroke-width="${R - r0}"/>`}</g>
      <circle cx="${cx}" cy="${cy}" r="${r0 - 2}" fill="url(#${gid}c)" stroke="${css('glass-line')}"/>
      <ellipse cx="${cx}" cy="${cy - r0 * 0.45}" rx="${r0 * 0.7}" ry="${r0 * 0.32}" fill="rgba(255,255,255,.14)"/>
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-family="Jakarta,Inter,sans-serif" font-weight="800" font-size="${S * 0.17}" fill="${css('tx')}">${esc(o.big == null ? tot : o.big)}</text>
      <text x="${cx}" y="${cy + S * 0.1}" text-anchor="middle" font-family="Inter,sans-serif" font-size="${S * 0.07}" fill="${css('mute')}">${esc(o.small || '')}</text></svg>`);
    if (o.onPick) svg.addEventListener('click', e => { const p = e.target.closest('path[data-i]'); if (p) o.onPick(items[+p.dataset.i]); });
    return svg;
  };
  Ch.legend = function (data, onPick) {
    const d = document.createElement('div'); d.className = 'legend';
    data.filter(x => x.value > 0).forEach(x => { const li = document.createElement('div'); li.className = 'li'; li.innerHTML = `<i style="background:${x.color}"></i><span>${esc(x.label)} <b>${x.value}</b></span>`; if (onPick) { li.style.cursor = 'pointer'; li.onclick = () => onPick(x); } d.append(li); });
    return d;
  };
  Ch.donutCard = function (data, o) {
    const w = document.createElement('div'); w.className = 'donutwrap'; w.append(Ch.donut(data, o), Ch.legend(data, o && o.onPick)); return w;
  };

  /* ---------- score ring ---------- */
  Ch.ring = function (pct, o) {
    o = o || {}; const S = o.size || 180, c = S / 2, R = S / 2 - 14, circ = 2 * Math.PI * R, gid = id('rg'), fid = id('rf');
    const tone = o.tone || (pct >= 75 ? 'good' : pct >= 50 ? 'warn' : 'bad'), col = css(tone);
    return el(`<svg class="chart" viewBox="0 0 ${S} ${S}" style="max-width:${S}px;height:auto;margin:auto"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="color-mix(in srgb,${col} 55%,#fff)"/><stop offset="1" stop-color="${col}"/></linearGradient>
      <filter id="${fid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs>
      <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${css('panel2')}" stroke-width="16"/>
      <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${circ * pct / 100} ${circ}" transform="rotate(-90 ${c} ${c})" opacity=".45" filter="url(#${fid})"/>
      <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="url(#${gid})" stroke-width="16" stroke-linecap="round" stroke-dasharray="${circ * pct / 100} ${circ}" transform="rotate(-90 ${c} ${c})"/>
      <text x="${c}" y="${c + S * 0.05}" text-anchor="middle" font-family="Jakarta,Inter,sans-serif" font-weight="800" font-size="${S * 0.27}" fill="${css('tx')}">${esc(o.big == null ? Math.round(pct) : o.big)}</text>
      <text x="${c}" y="${c + S * 0.19}" text-anchor="middle" font-family="Inter,sans-serif" font-weight="600" font-size="${S * 0.075}" fill="${css('mute')}">${esc(o.label || '')}</text></svg>`);
  };

  /* ---------- band / channel map ---------- */
  const BANDS = {
    '2.4 GHz': { lo: 2397, hi: 2489, ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(c => [2407 + 5 * c, c]), name: '2.4 GHz' },
    '5 GHz': { lo: 5160, hi: 5840, ticks: [36, 44, 52, 60, 100, 108, 116, 124, 132, 140, 149, 157, 165].map(c => [5000 + 5 * c, c]), dfs: [5250, 5730], name: '5 GHz' },
    '6 GHz': { lo: 5930, hi: 7130, ticks: [5, 21, 37, 53, 69, 85, 101, 117, 133, 149, 165, 181, 197, 213, 229].map(c => [5950 + 5 * c, c]), name: '6 GHz (Wi-Fi 6E / 7)' }
  };
  Ch.BANDS = BANDS;
  Ch.bandMap = function (nets, band, o) {
    o = o || {}; const B = BANDS[band], W = 720, H = 250, L = 34, Rr = 10, T = 14, Bt = 30, pw = W - L - Rr, ph = H - T - Bt;
    const X = f => L + (f - B.lo) / (B.hi - B.lo) * pw, Y = d => T + (1 - cl((d + 100) / 70, 0, 1)) * ph;
    const list = nets.filter(n => n.band === band).sort((a, b) => a.level - b.level);   // weak first, strong on top
    const gid = id('bm'); let defs = '', g = '', labels = '';
    list.forEach((n, i) => {
      const col = Ch.ssidColor(n.ssid), cf = n.center || n.frequency, w = n.width || 20, mine = o.me && n.bssid === o.me.toLowerCase();
      const hw = band === '2.4 GHz' ? 11 : w / 2, x0 = X(cf - hw), x1 = X(cf + hw), xm = X(cf), yt = Y(n.level), yb = Y(-100);
      defs += `<linearGradient id="${gid}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity="${mine ? .85 : .6}"/><stop offset="1" stop-color="${col}" stop-opacity=".07"/></linearGradient>`;
      const path = band === '2.4 GHz' ? `M${x0} ${yb}C${x0 + (xm - x0) * .35} ${yb} ${x0 + (xm - x0) * .35} ${yt} ${xm} ${yt}C${xm + (x1 - xm) * .65} ${yt} ${xm + (x1 - xm) * .65} ${yb} ${x1} ${yb}Z`
        : `M${x0} ${yb}L${x0 + 4} ${yt}L${x1 - 4} ${yt}L${x1} ${yb}Z`;
      g += `<path d="${path}" fill="url(#${gid}${i})" stroke="${col}" stroke-width="${mine ? 2.6 : 1.4}" stroke-linejoin="round" data-ssid="${esc(n.ssid)}" data-bssid="${esc(n.bssid)}" style="cursor:pointer"><title>${esc(n.ssid || '(hidden)')} | ch ${n.channel} | ${w} MHz | ${n.level} dBm</title></path>`;
      if (n.level > -78 && i >= list.length - 9) labels += `<text x="${xm}" y="${yt - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="${col}" stroke="${css('bg')}" stroke-width="3" paint-order="stroke" font-family="Inter,sans-serif">${esc((n.ssid || 'hidden').slice(0, 14))}</text>`;
    });
    let grid = '';
    [-40, -60, -80].forEach(d => { grid += `<line x1="${L}" x2="${W - Rr}" y1="${Y(d)}" y2="${Y(d)}" stroke="${css('glass-line')}" stroke-dasharray="3 4"/><text x="${L - 5}" y="${Y(d) + 4}" text-anchor="end" font-size="10.5" fill="${css('mute')}" font-family="Inter,sans-serif">${d}</text>`; });
    let ticks = '', dfs = '';
    B.ticks.forEach(([f, c]) => { ticks += `<text x="${X(f)}" y="${H - 11}" text-anchor="middle" font-size="11" fill="${css('mute')}" font-family="Inter,sans-serif">${c}</text><line x1="${X(f)}" x2="${X(f)}" y1="${H - Bt}" y2="${H - Bt + 4}" stroke="${css('mute')}"/>`; });
    if (B.dfs) dfs = `<rect x="${X(B.dfs[0])}" y="${T}" width="${X(B.dfs[1]) - X(B.dfs[0])}" height="${ph}" fill="${css('warn')}" opacity=".07"/><text x="${(X(B.dfs[0]) + X(B.dfs[1])) / 2}" y="${T + 12}" text-anchor="middle" font-size="10" font-weight="700" fill="${css('warn')}" opacity=".85" font-family="Inter,sans-serif">DFS (radar channels)</text>`;
    if (band === '6 GHz') B.ticks.forEach(([f]) => { dfs += `<circle cx="${X(f)}" cy="${H - Bt - 3}" r="2.5" fill="${css('acc')}" opacity=".6"/>`; });
    const svg = el(`<svg class="chart" viewBox="0 0 ${W} ${H}" style="height:auto"><defs>${defs}</defs><rect x="${L}" y="${T}" width="${pw}" height="${ph}" rx="10" fill="${css('panel2')}"/>${dfs}${grid}${g}${labels}<line x1="${L}" x2="${W - Rr}" y1="${H - Bt}" y2="${H - Bt}" stroke="${css('glass-line')}"/>${ticks}</svg>`);
    if (o.onPick) svg.addEventListener('click', e => { const p = e.target.closest('[data-ssid]'); if (p) o.onPick(p.dataset.ssid, p.dataset.bssid); });
    return svg;
  };

  /* ---------- radar locator ---------- */
  Ch.distance = (rssi, band) => Math.pow(10, ((band === '6 GHz' ? -52 : band === '5 GHz' ? -47 : -40) - rssi) / 28);   // log-distance, n=2.8 (indoor rough)
  Ch.radar = function (canvas, getNets, o) {
    o = o || {}; let ang = 0, last = performance.now(), alive = true, hit = [], sel = o.selected || null, pulse = {};
    const maxD = 60;
    function frame(t) {
      if (!alive || !canvas.isConnected) return; const dt = Math.min(60, t - last); last = t; ang = (ang + dt * 0.0016) % (Math.PI * 2);
      const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, hh = canvas.clientHeight; if (!w) { requestAnimationFrame(frame); return; }
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = hh * dpr; }
      const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
      const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 14, acc = css('acc'), acc2 = css('acc2'), line = css('glass-line'), tx = css('tx'), mute = css('mute');
      const bgG = g.createRadialGradient(cx, cy - R * .25, R * .1, cx, cy, R);
      const dark = document.documentElement.style.colorScheme === 'dark';
      bgG.addColorStop(0, dark ? 'rgba(20,60,90,.55)' : 'rgba(255,255,255,.9)'); bgG.addColorStop(1, dark ? 'rgba(5,15,30,.8)' : 'rgba(200,220,245,.8)');
      g.fillStyle = bgG; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
      g.strokeStyle = line; g.lineWidth = 1; g.font = '600 10.5px Inter,sans-serif'; g.fillStyle = mute; g.textAlign = 'left';
      [3, 10, 25, 60].forEach(d => { const r = R * Math.log10(1 + d) / Math.log10(1 + maxD); g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); g.fillText(d + ' m', cx + 4, cy - r + 11); });
      for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(k * Math.PI / 4), cy + R * Math.sin(k * Math.PI / 4)); g.stroke(); }
      // sweep
      const sg = g.createConicGradient ? g.createConicGradient(ang - 0.9, cx, cy) : null;
      if (sg) { sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.14, acc2 + '55'); sg.addColorStop(0.1425, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip(); g.fillStyle = sg; g.fillRect(cx - R, cy - R, 2 * R, 2 * R); g.restore(); }
      g.strokeStyle = acc; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang)); g.stroke();
      hit = [];
      getNets().forEach(n => {
        const d = Ch.distance(n.level, n.band), r = R * cl(Math.log10(1 + d) / Math.log10(1 + maxD), 0.06, 1);
        const base = (hash(n.bssid.split(':').slice(0, 5).join(':')) % 3600) / 3600 * Math.PI * 2, a = base + (n.band === '2.4 GHz' ? 0 : n.band === '5 GHz' ? 0.22 : 0.44);
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a), col = Ch.ssidColor(n.ssid);
        let diff = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (diff > Math.PI) diff = 0;
        const hitSweep = (((ang - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) < 0.12; if (hitSweep) pulse[n.bssid] = 1; pulse[n.bssid] = Math.max(0, (pulse[n.bssid] || 0) - dt / 1400);
        const p = pulse[n.bssid] || 0, size = 4 + cl((n.level + 95) / 8, 0, 6);
        g.fillStyle = col + '33'; g.beginPath(); g.arc(x, y, size + 3 + p * 12, 0, 7); g.fill();
        const gr = g.createRadialGradient(x - size * .3, y - size * .3, 1, x, y, size); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, col); gr.addColorStop(1, col);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, size, 0, 7); g.fill();
        if (sel && sel === n.ssid) { g.strokeStyle = tx; g.lineWidth = 2; g.beginPath(); g.arc(x, y, size + 6, 0, 7); g.stroke(); }
        if (n.band !== '2.4 GHz') { g.strokeStyle = tx; g.lineWidth = 1; g.beginPath(); g.arc(x, y, size + (n.band === '6 GHz' ? 3 : 0.5), 0, 7); g.stroke(); }
        hit.push({ x, y, r: size + 9, n });
      });
      g.fillStyle = acc; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      g.fillStyle = tx; g.font = '700 11px Inter,sans-serif'; g.textAlign = 'center'; g.fillText('YOU', cx, cy + 20);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    canvas.addEventListener('click', e => { const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; let best = null, bd = 1e9; hit.forEach(h => { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h.n; } }); if (best && o.onPick) { sel = best.ssid; o.onPick(best); } });
    return { stop() { alive = false; }, select(s) { sel = s; } };
  };

  /* ---------- RSSI / roam timeline ---------- */
  Ch.timeline = function (canvas, pts) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return; canvas.width = w * dpr; canvas.height = h * dpr;
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const L = 30, T = 8, B = 18, pw = w - L - 6, ph = h - T - B, Y = d => T + (1 - cl((d + 100) / 70, 0, 1)) * ph;
    g.font = '10.5px Inter,sans-serif'; g.fillStyle = css('mute'); g.strokeStyle = css('glass-line'); g.textAlign = 'right';
    [-40, -55, -70, -85].forEach(d => { g.beginPath(); g.setLineDash([3, 4]); g.moveTo(L, Y(d)); g.lineTo(w - 6, Y(d)); g.stroke(); g.setLineDash([]); g.fillText(d, L - 4, Y(d) + 4); });
    g.fillStyle = css('bad') + '14'; g.fillRect(L, Y(-70), pw, Y(-100) - Y(-70));
    if (pts.length < 2) return;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t, X = t => L + (t - t0) / Math.max(1, t1 - t0) * pw;
    g.lineWidth = 3; g.lineJoin = g.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; g.strokeStyle = Ch.ssidColor(b.bssid); g.beginPath(); g.moveTo(X(a.t), Y(a.rssi)); g.lineTo(X(b.t), Y(b.rssi)); g.stroke();
      if (a.bssid !== b.bssid) { g.strokeStyle = css('tx'); g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(b.t), T); g.lineTo(X(b.t), T + ph); g.stroke(); g.setLineDash([]); g.lineWidth = 3; } }
    g.fillStyle = css('mute'); g.textAlign = 'center'; g.fillText(Math.round((t1 - t0) / 1000) + ' s', w / 2, h - 3);
  };

  root.Charts = Ch;
})(window);
