/* ARC Signal - analysis engines: device identification, rogue scan, mesh analyzer, Zigbee coexistence, health score. */
(function (root) {
  const C = root.Core || (typeof module !== 'undefined' ? require('./core.js') : null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- device identification ---------- */
  const KINDS = { router: 'Router / AP', phone: 'Phone', tablet: 'Tablet', laptop: 'Laptop', pc: 'Computer', tv: 'TV / streamer', speaker: 'Smart speaker', camera: 'Camera', printer: 'Printer', game: 'Game console', iot: 'Smart device', nas: 'Storage / NAS', hub: 'Smart-home hub', unknown: 'Unknown' };
  C.KINDS = KINDS;
  C.guessKind = function (vendor, name, ports, banner) {
    const t = ((vendor || '') + ' ' + (name || '') + ' ' + (banner || '')).toLowerCase(), p = new Set(ports || []);
    const has = (...k) => k.some(x => t.includes(x));
    if (has('iphone', 'galaxy-s', 'galaxy s', 'pixel', 'android', 'oneplus', 'redmi', 'moto-', 'sm-g', 'sm-s') && !has('tab')) return 'phone';
    if (has('ipad', 'galaxy-tab', 'tab-', 'kindle', 'fire-hd', 'tablet')) return 'tablet';
    if (has('macbook', 'laptop', 'thinkpad', 'xps', 'inspiron', 'latitude', 'surface', 'chromebook', 'zenbook', 'envy-')) return 'laptop';
    if (has('desktop-', 'desktop', 'pc-', '-pc', 'imac', 'workstation', 'optiplex')) return 'pc';
    if (has('hue', 'philips lighting', 'signify', 'smartthings', 'hubitat', 'homeassistant', 'home-assistant', 'homebridge', 'aeotec', 'zwave', 'z-wave', 'zigbee', 'conbee', 'ring base', 'wink') || p.has(8123)) return 'hub';
    if (has('hikvision', 'dahua', 'amcrest', 'wyze', 'arlo', 'ring-', 'reolink', 'axis comm', 'lorex', 'swann', 'nest cam', 'camera', 'cam-', '-cam', 'doorbell', 'ipc') || p.has(554) || p.has(8554) || p.has(37777)) return 'camera';
    if (has('printer', 'laserjet', 'officejet', 'canon', 'brother', 'epson', 'xerox', 'lexmark', 'kyocera', 'ricoh', 'hp inc', 'hewlett') || p.has(631) || p.has(9100) || p.has(515)) return 'printer';
    if (has('sonos', 'echo', 'alexa', 'google home', 'nest mini', 'nest-', 'homepod', 'bose', 'speaker', 'denon', 'heos') || p.has(1400)) return 'speaker';
    if (has('roku', 'vizio', 'lg electronics', 'lgwebos', 'webos', 'tcl', 'hisense', 'chromecast', 'fire-tv', 'firetv', 'appletv', 'apple-tv', 'android tv', 'bravia', ' tv', 'tv-', 'amazon technologies', 'samsung tv', 'tizen') || p.has(8008) || p.has(8009) || p.has(3000) && has('lg')) return 'tv';
    if (has('playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'switch', 'sony interactive', 'steam deck')) return 'game';
    if (has('synology', 'qnap', 'nas', 'diskstation', 'wd ', 'western digital', 'drobo', 'unraid', 'truenas') || (p.has(5000) && p.has(445))) return 'nas';
    if (has('tp-link', 'netgear', 'ubiquiti', 'arris', 'askey', 'technicolor', 'sagemcom', 'actiontec', 'linksys', 'zyxel', 'eero', 'calix', 'commscope', 'cisco', 'mikrotik', 'gateway', 'router', 'modem', 'd-link', 'asustek', 'orbi', 'deco', 'velop', 'ruckus', 'aruba', 'sercomm', 'ubnt', 'upnp') || p.has(7547) || p.has(8291)) return 'router';
    if (has('espressif', 'tuya', 'sonoff', 'shelly', 'ecobee', 'honeywell', 'lutron', 'iot', 'smart', 'bulb', 'plug', 'thermostat', 'wiz', 'meross', 'kasa', 'tapo', 'govee', 'roborock', 'irobot', 'roomba')) return 'iot';
    if (has('private/random') || has('apple', 'samsung', 'xiaomi', 'huawei', 'oppo', 'motorola', 'google') || p.has(62078)) return 'phone';
    if (has('intel', 'dell', 'lenovo', 'realtek', 'micro-star', 'msi', 'gigabyte', 'giga-byte', 'asrock', 'hon hai', 'foxconn', 'liteon', 'azurewave', 'microsoft', 'acer', 'toshiba', 'asustek computer') || p.has(3389) || (p.has(445) && p.has(135))) return 'pc';
    return 'unknown';
  };

  /* ---------- helpers ---------- */
  const macNum = m => { const b = (m || '').split(':').map(x => parseInt(x, 16) || 0); if (b.length < 6) return 0; b[0] &= 0xfd; return b.reduce((a, x) => a * 256 + x, 0); };
  C.macNum = macNum;
  const lev = (a, b) => { a = a.toLowerCase(); b = b.toLowerCase(); const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  C.lev = lev;
  const spanOf = n => { const c = n.center || n.frequency, w = n.width || 20; return [c - w / 2, c + w / 2]; };
  C.freqOverlap = (a, b) => { if (a.band !== b.band) return false; const [a0, a1] = spanOf(a), [b0, b1] = spanOf(b); return a0 < b1 && b0 < a1; };
  C.ssidClusters = function (nets) {                 // radios that probably belong to one physical AP
    const sorted = nets.slice().sort((a, b) => macNum(a.bssid) - macNum(b.bssid)), out = [];
    for (const n of sorted) { const last = out[out.length - 1]; if (last && macNum(n.bssid) - macNum(last[last.length - 1].bssid) <= 12) last.push(n); else out.push([n]); }
    return out;
  };
  C.isLocal = m => !!(parseInt((m || '00').slice(0, 2), 16) & 2);

  /* ---------- rogue / suspicious networks ---------- */
  /* '<name>5G', '<name>-Guest', '<name>_EXT' are normal siblings; '<name>e' is a look-alike */
  const bandSuffix = (a, b) => { a = a.toLowerCase(); b = b.toLowerCase(); return a.startsWith(b) && /^[-_ .]*(2\.?4|5|6|guest|iot|ext|extender|mesh|plus|tv)[-_ .]*(g|ghz)?[-_ .]*$/.test(a.slice(b.length)); };
  C.rogueScan = function (nets, mine, vendors) {
    vendors = vendors || {}; const by = {}, F = [];
    const flag = (bssid, sev, why) => { const e = by[bssid] || (by[bssid] = { sev: 0, reasons: [] }); e.sev = Math.max(e.sev, sev); e.reasons.push(why); };
    const me = mine && nets.find(n => n.bssid.toLowerCase() === mine.toLowerCase()), mySsid = me && me.ssid;
    const myCluster = me ? C.ssidClusters(nets.filter(n => n.ssid === mySsid)).find(c => c.some(x => x.bssid === me.bssid)) || [] : [];
    const myVendors = new Set(nets.filter(n => n.ssid === mySsid).map(n => (vendors[n.bssid] || '').toLowerCase()).filter(Boolean));
    nets.forEach(n => {
      const sibling = mySsid && nets.some(x => x.ssid === mySsid && Math.abs(macNum(x.bssid) - macNum(n.bssid)) <= 64);   // same hardware (e.g. a guest or 5G name)
      if (mySsid && n.ssid && n.ssid !== mySsid && !sibling && !bandSuffix(n.ssid, mySsid) && !bandSuffix(mySsid, n.ssid) && lev(n.ssid, mySsid) <= 2 && lev(n.ssid, mySsid) > 0) { flag(n.bssid, 3, `Name looks like yours ("${mySsid}")`); F.push({ sev: 3, tag: 'rogue', title: `Look-alike network name "${n.ssid}"`, why: `Differs from your "${mySsid}" by only ${lev(n.ssid, mySsid)} character(s). Used in phishing/evil-twin attacks, or just a neighbor with a similar name.`, fix: 'Check the BSSID against your router label. If it is not yours, do not connect and tell the customer.' }); }
      if (mySsid && n.ssid === mySsid && n.bssid !== me.bssid) {
        if (n.open) { flag(n.bssid, 3, 'Your SSID with NO encryption'); }
        else if (n.security && me.security && n.security !== me.security) flag(n.bssid, 2, `Your SSID, different security (${n.security})`);
        const v = (vendors[n.bssid] || '').toLowerCase();
        if (v && myVendors.size > 0 && ![...myVendors].some(x => x === v) && !myCluster.some(x => x.bssid === n.bssid)) flag(n.bssid, 2, `Your SSID on different hardware (${vendors[n.bssid]})`);
        if (n.level - me.level >= 15 && n.band === me.band) flag(n.bssid, 1, 'Much stronger than your own AP on the same band');
      }
      if (!n.ssid && n.level >= -60) flag(n.bssid, 1, 'Strong hidden network');
      if (n.band === '2.4 GHz' && n.channel >= 12) flag(n.bssid, 1, `Channel ${n.channel} is not legal in the US (imported / misconfigured gear)`);
      if (/^(iphone|android|galaxy|pixel|direct-|moto|.*hotspot|.*\bmifi\b)/i.test(n.ssid || '')) flag(n.bssid, 0, 'Phone hotspot / Wi-Fi Direct device');
      if (/WEP|^WPA$|^WPA-TKIP/i.test(n.security || '') && n.level > -70) flag(n.bssid, 1, `Weak security (${n.security})`);
    });
    // devices advertising many SSIDs (karma / pineapple behaviour)
    C.ssidClusters(nets).forEach(c => { const ss = new Set(c.map(x => x.ssid || '(hidden)')); if (ss.size >= 6 && c.some(x => x.open)) { c.forEach(x => flag(x.bssid, 3, `One device broadcasts ${ss.size} network names, some open`)); F.push({ sev: 3, tag: 'rogue', title: `One device is broadcasting ${ss.size} different network names`, why: 'Rogue-AP tools (Karma / WiFi Pineapple) answer to many names to lure phones. Large venues with managed Wi-Fi can also do this legitimately.', fix: 'Locate it with the radar / hunt mode and confirm it is managed equipment.' }); } });
    Object.entries(by).forEach(([b, e]) => { if (e.sev >= 2) { const n = nets.find(x => x.bssid === b); if (!F.some(f => f.bssid === b)) F.push({ sev: e.sev, tag: 'rogue', bssid: b, title: `Suspicious: ${n.ssid || '(hidden)'} (${b})`, why: e.reasons.join('; ') + `. Signal ${n.level} dBm on ${n.band} ch ${n.channel}.`, fix: 'Walk toward the strongest signal with Hunt mode to find the device.' }); } });
    F.sort((a, b) => b.sev - a.sev); return { by, findings: F };
  };

  /* ---------- mesh analyzer ---------- */
  C.NONDFS5 = [36, 40, 44, 48, 149, 153, 157, 161];
  C.PSC6 = [5, 21, 37, 53, 69, 85, 101, 117, 133, 149, 165, 181, 197, 213, 229];
  C.pickChannels = function (band, count, others, width) {
    const cand = band === '2.4 GHz' ? [1, 6, 11] : band === '5 GHz' ? (width >= 80 ? [36, 149] : width >= 40 ? [36, 44, 149, 157] : C.NONDFS5) : C.PSC6.filter((c, i) => width >= 160 ? i % 2 === 0 : true);
    const freq = c => band === '2.4 GHz' ? 2407 + 5 * c : band === '5 GHz' ? 5000 + 5 * c : 5950 + 5 * c, w = band === '2.4 GHz' ? 20 : width || 20, load = c => others.filter(n => n.band === band).reduce((s, n) => { const nc = n.center || n.frequency, nw = n.band === '2.4 GHz' ? 22 : (n.width || 20); return s + (Math.abs(freq(c) - nc) < (w + nw) / 2 ? Math.pow(clamp((n.level + 100) / 60, 0, 1), 2) : 0); }, 0);
    const used = {}, out = [];
    for (let i = 0; i < count; i++) { let best = cand[0], bs = 1e9; cand.forEach(c => { const s = load(c) + (used[c] || 0) * 3 + (band === '5 GHz' && C.isDFS(c) ? 1.5 : 0); if (s < bs) { bs = s; best = c; } }); used[best] = (used[best] || 0) + 1; out.push(best); }
    return out;
  };
  C.meshAnalyze = function (ssid, nets, me) {
    const mine = nets.filter(n => n.ssid === ssid), others = nets.filter(n => n.ssid !== ssid);
    const clusters = C.ssidClusters(mine).map((radios, i) => ({ id: i + 1, radios: radios.sort((a, b) => a.frequency - b.frequency) }));
    const F = [], add = (sev, title, why, fix) => F.push({ sev, title, why, fix, tag: 'mesh' });
    let pen = 0;
    const bands = ['2.4 GHz', '5 GHz', '6 GHz'];
    if (clusters.length === 1 && mine.length >= 1) add(0, 'One access point detected for this name', mine.length > 1 ? `It has ${mine.length} radios (${mine.map(n => n.band).join(', ')}). If the customer has more nodes they are out of range of this phone, or they use a different SSID.` : 'Single radio visible.', 'Walk to other areas and scan again to see additional nodes.');
    // security consistency
    const secs = new Set(mine.map(n => n.security)); if (secs.size > 1) { add(2, 'Radios use different security settings', `Found: ${[...secs].join(', ')}. Clients cannot roam cleanly between nodes with different security.`, 'Make every node use the same security (WPA2-AES or WPA2/WPA3).'); pen += 15; }
    bands.forEach(band => {
      const rs = mine.filter(n => n.band === band); if (rs.length < 2) return;
      const nodesOn = new Set(rs.map(r => clusters.find(c => c.radios.includes(r)).id));
      // co-channel / overlap between different nodes
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j], ca = clusters.find(c => c.radios.includes(a)).id, cb = clusters.find(c => c.radios.includes(b)).id; if (ca === cb) continue;
        if (C.freqOverlap(a, b)) { const strong = a.level > -70 && b.level > -70; add(strong ? 2 : 1, `${band}: nodes ${ca} and ${cb} overlap on channel ${a.channel}${a.channel !== b.channel ? '/' + b.channel : ''}`, `${a.level} dBm and ${b.level} dBm at your position. Nodes that can hear each other on the same channel share airtime, so each client sees roughly half the speed and more latency.`, `Put them on different channels (see the suggested plan below).`); pen += strong ? 12 : 6; }
        if (a.level > -45 && b.level > -45) { add(1, `Nodes ${ca} and ${cb} are very close together`, 'Both are strong at the same spot, so they are likely in the same room or stacked.', 'Space mesh nodes 8-12 m apart with at most one wall between them.'); pen += 6; }
      }
      const ws = new Set(rs.map(r => r.width)); if (ws.size > 1) add(1, `${band}: nodes use different channel widths`, [...ws].join(' / ') + ' MHz.', 'Use the same width on all nodes of a band.');
    });
    // k/v/r
    const withIE = mine.filter(n => n.k !== undefined);
    if (withIE.length) { const nk = withIE.filter(n => !n.k).length, nv = withIE.filter(n => !n.v).length, nr = withIE.filter(n => !n.r).length;
      if (nk || nv) { add(1, 'Roaming helpers (802.11k/v) missing on some radios', `Missing k: ${nk}, missing v: ${nv} of ${withIE.length} radios. These let the network nudge phones to a better node.`, 'Enable "Smart Connect / Band steering / Roaming assist (802.11k/v)" in the mesh app.'); pen += 6; }
      if (nr && clusters.length > 1) add(0, 'Fast roaming (802.11r) is off', 'Optional. Helps voice/video calls roam without a pause, but some older devices fail to join when it is on.', 'Enable only if no client has trouble joining.'); }
    // utilization
    mine.filter(n => n.util != null && n.util >= 128).forEach(n => { add(n.util >= 190 ? 2 : 1, `${n.band} radio is ${Math.round(n.util / 2.55)}% busy`, `${n.stations != null ? n.stations + ' clients attached. ' : ''}High airtime use means interference or too many clients on this radio.`, 'Change channel, reduce width, or add a node nearby.'); pen += n.util >= 190 ? 10 : 5; });
    // band support
    if (!mine.some(n => n.band === '5 GHz' || n.band === '6 GHz') && mine.length) { add(1, 'No 5 GHz / 6 GHz radio for this name', 'Everything is on 2.4 GHz, the slowest and most crowded band.', 'Enable 5 GHz (and 6 GHz if the nodes support Wi-Fi 6E/7).'); pen += 10; }
    const weak = mine.filter(n => n.level < -75); if (mine.length && weak.length === mine.length) { add(1, 'Every radio is weak here', 'This spot is at the edge of coverage.', 'Add a node between here and the closest existing one.'); pen += 8; }
    // 2.4 plan sanity
    mine.filter(n => n.band === '2.4 GHz' && ![1, 6, 11].includes(n.channel)).forEach(n => { add(2, `2.4 GHz node on channel ${n.channel}`, 'Only 1, 6 and 11 are non-overlapping.', 'Move to 1, 6 or 11.'); pen += 8; });
    mine.filter(n => n.band === '5 GHz' && C.isDFS(n.channel)).forEach(n => add(1, `5 GHz node on DFS channel ${n.channel}`, 'DFS channels can drop for a minute or more when radar is detected, which breaks mesh backhaul.', 'Use 36-48 or 149-165.'));
    // channel plan
    const plan = [];
    bands.forEach(band => { const rs = mine.filter(n => n.band === band); const nodeIds = [...new Set(rs.map(r => clusters.find(c => c.radios.includes(r)).id))]; if (!nodeIds.length) return;
      const width = band === '2.4 GHz' ? 20 : (nodeIds.length > 2 ? 40 : band === '6 GHz' ? 80 : 80);
      const chans = C.pickChannels(band, nodeIds.length, others, width); nodeIds.forEach((id, i) => { const cur = rs.find(r => clusters.find(c => c.radios.includes(r)).id === id); plan.push({ band, node: id, current: cur.channel, suggested: chans[i], width, change: cur.channel !== chans[i] }); }); });
    const seen = new Set(); const FF = F.filter(f => !seen.has(f.title) && seen.add(f.title)); F.length = 0; F.push(...FF);
    F.sort((a, b) => b.sev - a.sev);
    return { ssid, clusters, findings: F, plan, score: clamp(100 - pen, 5, 100) };
  };

  /* ---------- Zigbee / Thread coexistence ---------- */
  C.zigbee = function (nets) {
    const out = [];
    for (let ch = 11; ch <= 26; ch++) { const f = 2405 + 5 * (ch - 11); let load = 0; nets.filter(n => n.band === '2.4 GHz').forEach(n => { if (Math.abs(f - n.frequency) < 12) load += Math.pow(clamp((n.level + 100) / 60, 0, 1), 2) * (Math.abs(f - n.frequency) < 8 ? 1 : .5); }); out.push({ ch, freq: f, load }); }
    const best = out.slice().sort((a, b) => a.load - b.load || [25, 20, 15, 26].indexOf(b.ch) - [25, 20, 15, 26].indexOf(a.ch))[0]; return { channels: out, best };
  };

  /* ---------- health score ---------- */
  C.healthScore = function (x) {
    let s = 100, why = [];
    if (x.verdictSev === 2) { s -= 35; why.push('Packet loss or outage'); } else if (x.verdictSev === 1) { s -= 15; why.push('High jitter or delay'); }
    if (x.rssi != null) { if (x.rssi < -80) { s -= 30; why.push('Very weak Wi-Fi signal'); } else if (x.rssi < -70) { s -= 18; why.push('Weak Wi-Fi signal'); } else if (x.rssi < -67) s -= 6; }
    if (x.bloat != null) { if (x.bloat > 200) { s -= 15; why.push('Bufferbloat'); } else if (x.bloat > 60) s -= 7; }
    if (x.down != null && x.down < 10) { s -= 12; why.push('Slow download'); }
    return { score: clamp(Math.round(s), 5, 100), why };
  };
  C.tr = { 2.4: '2.4 GHz', 5: '5 GHz', 6: '6 GHz' };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
