/* ARC Signal - core logic (ported from Live Monitor v3 Go code). Works in browser and node. */
(function (root) {
  'use strict';
  const C = {};

  /* ---------- latency probe: RFC3550 jitter, rolling loss, outage + spike events ---------- */
  class Probe {
    constructor(name, target) {
      this.name = name; this.target = target;
      this.hist = new Array(90).fill(0);   // ms, -1 = lost, 0 = no data yet
      this.win = [];                        // last 100 results
      this.sent = 0; this.recv = 0; this.min = Infinity; this.max = 0;
      this.jitter = 0; this.last = 0; this.haveLast = false;
      this.consecLoss = 0; this.inOutage = false; this.outageStart = 0; this.lastSpike = 0;
    }
    add(rtt, ok, now) {
      now = now || Date.now();
      const evs = []; this.sent++;
      let val = -1;
      if (ok) {
        val = rtt; this.recv++;
        if (rtt < this.min) this.min = rtt;
        if (rtt > this.max) this.max = rtt;
        if (this.haveLast) this.jitter += (Math.abs(rtt - this.last) - this.jitter) / 16;
        this.last = rtt; this.haveLast = true;
        if (this.inOutage) {
          this.inOutage = false;
          evs.push({ t: now, kind: 'recovered', source: this.name, sev: 0,
            msg: `${this.name} reachable again after ${Math.round((now - this.outageStart) / 1000)}s` });
        }
        const avg = this._avg();
        if (this.win.length >= 20 && rtt > Math.max(150, 4 * avg) && now - this.lastSpike > 30000) {
          this.lastSpike = now;
          evs.push({ t: now, kind: 'spike', source: this.name, sev: 1,
            msg: `${this.name} latency spike ${Math.round(rtt)} ms (avg ${Math.round(avg)} ms)` });
        }
        this.consecLoss = 0;
      } else {
        this.consecLoss++;
        if (this.consecLoss === 3 && !this.inOutage) {
          this.inOutage = true; this.outageStart = now - 2000;
          evs.push({ t: now, kind: 'outage', source: this.name, sev: 2,
            msg: `${this.name} unreachable (3 lost in a row)` });
        }
      }
      this.hist.shift(); this.hist.push(val);
      this.win.push(val); if (this.win.length > 100) this.win.shift();
      return evs;
    }
    _avg() { const ok = this.win.filter(v => v >= 0); return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0; }
    snap() {
      const n = this.win.length, ok = this.win.filter(v => v >= 0);
      return {
        name: this.name, target: this.target, hist: this.hist.slice(), sent: this.sent, recv: this.recv,
        lossPct: n ? (n - ok.length) / n * 100 : 0,
        avg: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0,
        min: ok.length ? Math.min(...ok) : 0, max: ok.length ? Math.max(...ok) : 0,
        jitter: this.jitter, last: this.hist[this.hist.length - 1], inOutage: this.inOutage
      };
    }
    reset() { Object.assign(this, new Probe(this.name, this.target)); }
  }
  C.Probe = Probe;

  C.quality = s => {
    if (s.sent < 3) return '...';
    if (s.inOutage || s.lossPct > 2 || s.jitter > 30) return 'Poor';
    if (s.lossPct > 0.5 || s.jitter > 15 || s.avg > 80) return 'Fair';
    return 'Good';
  };

  /* Verdict. gw may be null (web version cannot reach the router): then it compares internet targets. */
  C.diagnose = function (gw, probes, onWifi) {
    const inet = probes.filter(p => p.sent >= 5);
    if (inet.length === 0 || (gw && gw.sent < 5)) return ['Collecting data...', 0];
    const bad = inet.filter(p => p.inOutage || p.lossPct > 2);
    const hiJit = inet.filter(p => p.jitter > 25 || p.avg > 100);
    if (gw && (gw.inOutage || gw.lossPct > 3))
      return [onWifi ? 'Loss between this phone and the router: Wi-Fi or router problem (local)'
                     : 'Loss between this device and the router: cable/port/router problem (local)', 2];
    if (bad.length === inet.length)
      return [gw ? 'Router is fine, loss beyond it: ISP or internet path problem'
                 : 'All targets are dropping packets: local Wi-Fi/router or the ISP. Run this in the app to separate them', 2];
    if (bad.length > 0)
      return [`Only ${bad.map(p => p.name).join(', ')} dropping: a path problem toward that service, not your line`, 1];
    if (gw && gw.jitter > 20 && onWifi) return ['High jitter to the router on Wi-Fi: interference or weak signal', 1];
    if (hiJit.length === inet.length)
      return [gw ? 'Internet latency/jitter is high while the router is clean: ISP congestion or line noise'
                 : 'Latency/jitter is high everywhere: Wi-Fi congestion, weak signal, or ISP congestion', 1];
    if (gw && gw.avg > 15 && onWifi) return ['Router latency is high for a LAN: Wi-Fi congestion', 1];
    return ['No loss or jitter problems detected', 0];
  };

  /* ---------- line quality ---------- */
  C.percentile = (sorted, p) => {
    if (!sorted.length) return 0;
    const i = (p / 100) * (sorted.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  };
  C.lineGrade = (loss, jitter, avg, sent) => {
    if (sent < 5) return '-';
    if (loss > 3 || jitter > 60) return 'F';
    if (loss > 1 || jitter > 30) return 'D';
    if (loss > 0.5 || jitter > 15 || avg > 150) return 'C';
    if (loss > 0.1 || jitter > 8 || avg > 100) return 'B';
    if (loss > 0 || jitter > 3) return 'A';
    return 'A+';
  };
  C.lineStats = function (samples) {
    const st = { sent: 0, lost: 0, lossPct: 0, avg: 0, min: 0, max: 0, p95: 0, jitter: 0, grade: '-' };
    const ok = []; let prev = -1, js = 0, jn = 0;
    for (const v of samples) {
      st.sent++;
      if (v < 0) { st.lost++; continue; }
      ok.push(v); if (prev >= 0) { js += Math.abs(v - prev); jn++; } prev = v;
    }
    if (st.sent) st.lossPct = st.lost / st.sent * 100;
    if (ok.length) {
      const s = ok.slice().sort((a, b) => a - b);
      st.min = s[0]; st.max = s[s.length - 1]; st.avg = s.reduce((a, b) => a + b, 0) / s.length; st.p95 = C.percentile(s, 95);
    }
    if (jn) st.jitter = js / jn;
    st.grade = C.lineGrade(st.lossPct, st.jitter, st.avg, st.sent);
    return st;
  };
  C.lineVerdict = g => ({
    'A+': 'Clean line: no meaningful loss or jitter.', 'A': 'Clean line: no meaningful loss or jitter.',
    'B': 'Good, with a little loss/jitter. Fine for browsing and streaming.',
    'C': 'Noticeable jitter/loss. Video calls and games may stutter.',
    'D': 'Poor: loss/jitter will break calls and games.', 'F': 'Poor: loss/jitter will break calls and games.'
  }[g] || 'Not enough samples yet.');

  /* ---------- bufferbloat ---------- */
  C.bloatGrade = ms => ms < 5 ? 'A+' : ms < 30 ? 'A' : ms < 60 ? 'B' : ms < 200 ? 'C' : ms < 400 ? 'D' : 'F';
  C.bloatText = ms => {
    const g = C.bloatGrade(ms);
    if (g === 'A+' || g === 'A') return 'Latency stays low when the line is busy: great for calls and gaming during downloads.';
    if (g === 'B') return 'A little extra delay under load. Mostly fine.';
    if (g === 'C') return 'Delay climbs when the line is busy: calls/games lag during big downloads or uploads.';
    return 'Large delay when the line is full. If it repeats on several runs, the router or modem queue is filling: enable SQM/QoS (fq_codel/CAKE) or set the router speed limit to about 90% of the line. One bad run on a phone can be noise.';
  };

  /* ---------- signal helpers ---------- */
  C.rssiInfo = dbm => {
    if (dbm == null || isNaN(dbm)) return { label: '-', pct: 0, tone: 'idle', note: '' };
    const pct = Math.max(0, Math.min(100, Math.round((dbm + 100) * 100 / 60)));
    if (dbm >= -50) return { label: 'Excellent', pct, tone: 'good', note: 'Full speed possible.' };
    if (dbm >= -60) return { label: 'Very good', pct, tone: 'good', note: 'Solid for everything including 4K and calls.' };
    if (dbm >= -67) return { label: 'Good', pct, tone: 'good', note: 'Minimum recommended for video calls and streaming.' };
    if (dbm >= -70) return { label: 'Fair', pct, tone: 'warn', note: 'Okay for browsing; calls may stutter at the edges.' };
    if (dbm >= -80) return { label: 'Weak', pct, tone: 'bad', note: 'Expect retries, slow speeds and drops. Move closer or add an access point.' };
    return { label: 'Very weak', pct, tone: 'bad', note: 'Connection will be unreliable.' };
  };
  C.channelOf = f => f >= 2412 && f <= 2484 ? (f === 2484 ? 14 : (f - 2407) / 5)
    : f >= 5160 && f <= 5885 ? (f - 5000) / 5 : f >= 5955 && f <= 7115 ? (f - 5950) / 5 : 0;
  C.bandOf = f => f < 3000 ? '2.4 GHz' : f < 5900 ? '5 GHz' : '6 GHz';
  C.isDFS = ch => ch >= 52 && ch <= 144;
  C.overlap = (a, b, band) => band === '2.4 GHz' ? Math.abs(a - b) <= 4 : a === b;

  C.bestChannel24 = nets => {
    const load = { 1: 0, 6: 0, 11: 0 };
    for (const n of nets) {
      if (n.band !== '2.4 GHz') continue;
      const w = Math.pow(Math.max(0, Math.min(100, (n.level + 100) * 100 / 60)) / 100, 2);
      for (const c of [1, 6, 11]) if (C.overlap(c, n.channel, '2.4 GHz')) load[c] += w;
    }
    let best = 1; for (const c of [1, 6, 11]) if (load[c] < load[best]) best = c;
    return { best, load };
  };

  /* ---------- Wi-Fi environment analysis: rogue / bad-setup findings ----------
     nets: [{ssid,bssid,level,frequency,channel,band,width,security,open}]
     mine: connected bssid (optional) */
  C.analyzeWifi = function (nets, mine) {
    const F = [];
    const add = (sev, title, why, fix, tag) => F.push({ sev, title, why, fix, tag: tag || 'wifi' });
    const me = nets.find(n => mine && n.bssid.toLowerCase() === mine.toLowerCase());
    const mySsid = me ? me.ssid : null;

    // 1) Evil twin / rogue: same SSID as ours with different security, or open clone
    if (mySsid) {
      const clones = nets.filter(n => n.ssid === mySsid && n.bssid !== me.bssid);
      for (const c of clones) {
        if (c.open && !me.open)
          add(3, `Open network using your SSID "${mySsid}"`, `${c.bssid} (${c.band}, ch ${c.channel}, ${c.level} dBm) advertises your network name with no encryption. That is the classic evil-twin / rogue AP pattern, or someone's misconfigured guest AP.`,
            'Find the device by walking toward the strongest signal. If it is not yours, unplug it and report it. Do not let clients join it.', 'rogue');
        else if (c.security && me.security && c.security !== me.security)
          add(2, `Same SSID, different security (${c.security} vs ${me.security})`, `${c.bssid} is broadcasting "${mySsid}" with different encryption than your AP. Clients may roam onto the weaker one.`,
            'Make every AP of one SSID use identical security, or rename the odd one out.', 'rogue');
      }
      const mine24 = clones.filter(c => c.band === '2.4 GHz').length, mine5 = clones.filter(c => c.band !== '2.4 GHz').length;
      if (clones.length && clones.every(c => c.level > -75))
        add(1, `${clones.length + 1} radios share the SSID "${mySsid}"`, 'That is normal for mesh/dual-band, but if these are separate routers (not a mesh) clients will cling to a weak one and stall.',
          'If they are separate routers, give each a unique SSID or turn the extra ones into access points on the same LAN (no second DHCP/NAT).', 'layout');
    }
    // 2) Stacked / co-located APs: strong, same channel, similar vendor prefix
    const strong = nets.filter(n => n.level >= -50);
    const byCh = {};
    strong.forEach(n => { (byCh[n.band + n.channel] = byCh[n.band + n.channel] || []).push(n); });
    for (const k of Object.keys(byCh)) {
      const g = byCh[k];
      if (g.length >= 2)
        add(2, `${g.length} very strong access points on the same channel (${g[0].band} ch ${g[0].channel})`,
          'Two transmitters this close on one channel is what you get when routers are stacked on top of each other or side by side. They drown each other out and double the retries.',
          'Separate them by 3+ m, or put them on non-overlapping channels (2.4: 1/6/11, 5 GHz: different 20/40 MHz blocks), or turn one into a wired access point.', 'layout');
    }
    // 3) 2.4 GHz crowding and channel choice
    const n24 = nets.filter(n => n.band === '2.4 GHz');
    if (n24.length) {
      const { best, load } = C.bestChannel24(n24);
      if (me && me.band === '2.4 GHz') {
        const nb = n24.filter(n => n.bssid !== me.bssid && C.overlap(me.channel, n.channel, '2.4 GHz') && n.level > -75).length;
        if (![1, 6, 11].includes(me.channel))
          add(2, `Your 2.4 GHz channel ${me.channel} straddles other channels`, 'Channels other than 1, 6 and 11 overlap two or three neighbours instead of one. This is the most common self-inflicted Wi-Fi problem.', `Set the router to channel ${best} (least loaded of 1/6/11).`, 'channel');
        else if (nb >= 3)
          add(1, `${nb} networks share your 2.4 GHz channel ${me.channel}`, 'Co-channel neighbours take turns on air; your throughput and latency suffer in the evening when everyone is home.', `Try channel ${best} or move devices to 5 GHz.`, 'channel');
        if (me.width && me.width >= 40) add(1, '2.4 GHz is using a 40 MHz wide channel', 'Wide channels on 2.4 GHz leave room for only one non-overlapping channel and cause constant collisions in crowded areas.', 'Set 2.4 GHz channel width to 20 MHz.', 'channel');
      }
      if (n24.length > 12) add(1, `${n24.length} networks visible on 2.4 GHz`, 'The band is saturated by neighbours. Expect random slowdowns that no router setting can fully fix.', 'Prefer 5 GHz (or 6 GHz) for anything that supports it.', 'channel');
    }
    if (me) {
      const rs = C.rssiInfo(me.level);
      if (me.level < -70) add(2, `Weak signal to your AP (${me.level} dBm)`, rs.note, 'Move the AP closer to where devices are used, or add a wired access point. Avoid placing it on the floor, in a cabinet or near metal.', 'signal');
      if (me.band === '2.4 GHz' && nets.some(n => n.ssid === me.ssid && n.band !== '2.4 GHz'))
        add(1, 'Connected on 2.4 GHz while a 5 GHz radio is available', 'The phone chose the slower, noisier band (band steering is off or the 5 GHz signal is weaker).', 'Use separate SSIDs for 2.4/5 GHz to force the choice, or enable band steering.', 'band');
      if (me.band === '5 GHz' && C.isDFS(me.channel))
        add(1, `5 GHz channel ${me.channel} is a DFS channel`, 'If a radar or weather system is detected the router must leave the channel for 60 s or more, which shows up as random 1-minute Wi-Fi outages.', 'If you see periodic drops, move to a non-DFS channel (36-48 or 149-165).', 'channel');
    }
    // 4) hidden SSIDs / WPS / old crypto among visible networks
    nets.filter(n => /WEP/i.test(n.security || '')).forEach(n => add(2, `WEP network "${n.ssid || '(hidden)'}" nearby`, 'WEP can be cracked in minutes. If it is yours it should be replaced.', 'Switch to WPA2/WPA3.', 'security'));
    nets.filter(n => n.open && n.ssid && n.ssid !== mySsid && /^(xfinitywifi|attwifi|optimumwifi|spectrumwifi|cablewifi|free.?wifi|guest)/i.test(n.ssid))
      .forEach(n => add(1, `Open "${n.ssid}" hotspot visible`, 'Shared ISP hotspots on a customer gateway use extra airtime on your channel.', 'Ask the ISP to disable public Wi-Fi on the gateway, or put the gateway in bridge mode.', 'layout'));
    if (me && /WPA\b|TKIP/i.test(me.security || '') && !/WPA2|WPA3/i.test(me.security))
      add(2, 'Your network uses legacy WPA/TKIP', 'TKIP caps speeds at 54 Mbps and is insecure; some phones will refuse to roam properly.', 'Use WPA2-AES or WPA2/WPA3 mixed.', 'security');
    F.sort((a, b) => b.sev - a.sev);
    return F;
  };

  /* ---------- LAN checks from traceroute hops ---------- */
  C.isPrivateIP = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip || '');
  C.isCGNAT = ip => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip || '');
  C.analyzeHops = function (hops) { // hops: [{ttl, ip, rtt}]
    const F = []; const ips = hops.filter(h => h.ip);
    const priv = []; for (const h of ips) { if (C.isPrivateIP(h.ip)) priv.push(h); else break; }
    if (priv.length >= 2)
      F.push({ sev: 2, tag: 'layout', title: `Double NAT: ${priv.length} private hops before the internet (${priv.map(h => h.ip).join(' > ')})`,
        why: 'Two routers are each doing NAT (a stacked router, or ISP gateway plus your own router). Causes gaming/VoIP/port-forward problems and extra latency.',
        fix: 'Put the ISP gateway in bridge/IP-passthrough mode, or switch the second router to Access Point mode (WAN unused, DHCP off, plug into a LAN port).' });
    const first = ips[0];
    if (first && first.rtt > 15) F.push({ sev: 1, tag: 'signal', title: `First hop (${first.ip}) answers in ${Math.round(first.rtt)} ms`,
      why: 'A router one hop away should answer in 1-5 ms on good Wi-Fi. High values mean airtime congestion, retries or a weak link.', fix: 'Check signal, channel and band; test again near the router.' });
    if (ips.some(h => C.isCGNAT(h.ip))) F.push({ sev: 1, tag: 'isp', title: 'ISP uses carrier-grade NAT (100.64.x.x hop)',
      why: 'You do not have a public IP. Inbound connections (cameras, port forwards, hosting) will not work.', fix: 'Ask the ISP for a public IP or use a tunnel/relay.' });
    return F;
  };

  /* ---------- modem levels (DOCSIS) from numbers typed or parsed ---------- */
  C.modemCheck = function (v) {
    const R = [], ok = x => x != null && !isNaN(x);
    const f = (sev, t, d) => R.push({ sev, title: t, why: d });
    if (ok(v.dsPowerMin) && ok(v.dsPowerMax)) {
      if (v.dsPowerMin < -10 || v.dsPowerMax > 10) f(2, 'Downstream power out of range', `${v.dsPowerMin} to ${v.dsPowerMax} dBmV; spec is -10..+10 (ideal -7..+7). Check splitters, loose or corroded connectors, damaged coax.`);
      else if (v.dsPowerMin < -7 || v.dsPowerMax > 7) f(1, 'Downstream power outside the ideal window', `${v.dsPowerMin} to ${v.dsPowerMax} dBmV; ideal is -7..+7.`);
      else f(0, 'Downstream power is healthy', `${v.dsPowerMin} to ${v.dsPowerMax} dBmV.`);
      if (v.dsPowerMax - v.dsPowerMin > 6) f(1, 'Large spread between channels', 'More than 6 dB difference across channels points to a bad splitter/tilt or a cable fault.');
    }
    if (ok(v.dsSnr)) {
      if (v.dsSnr < 30) f(2, 'Downstream SNR too low: noise on the line', `${v.dsSnr} dB. Below 30 dB causes dropped packets and disconnects. Suspect ingress noise, bad connectors, a failing amp or a noisy device near the coax.`);
      else if (v.dsSnr < 33) f(1, 'Downstream SNR marginal', `${v.dsSnr} dB; 256-QAM wants 33+ dB.`);
      else f(0, 'Downstream SNR is healthy', `${v.dsSnr} dB.`);
    }
    if (ok(v.usPower)) {
      if (v.usPower > 51) f(2, 'Upstream power too high', `${v.usPower} dBmV. The modem is shouting to be heard: attenuation/loss between you and the node. Above 51 causes T3/T4 timeouts and resets.`);
      else if (v.usPower > 49) f(1, 'Upstream power high', `${v.usPower} dBmV; target 38-48.`);
      else if (v.usPower < 35) f(1, 'Upstream power low', `${v.usPower} dBmV; target 38-48.`);
      else f(0, 'Upstream power is healthy', `${v.usPower} dBmV.`);
    }
    if (ok(v.uncorr)) {
      if (v.uncorr > 100) f(2, 'Uncorrectable errors are climbing', `${v.uncorr} uncorrectable codewords. Each one is a lost packet the modem could not repair: this is the "intermittent" you hear about. Capture the page and call the ISP.`);
      else if (v.uncorr > 0) f(1, 'Some uncorrectable errors', `${v.uncorr} found. Watch whether the count rises over an hour.`);
      else f(0, 'No uncorrectable errors', '');
    }
    if (ok(v.corr) && v.corr > 100000) f(1, 'High correctable error count', `${v.corr}. Correctable errors are repaired silently but a fast-rising count shows a marginal signal.`);
    return R;
  };

  /* ---------- device risk (port rules) ---------- */
  C.PORTS = {
    21: ['FTP', 2, 'Plain-text file transfer; credentials sent unencrypted.'], 22: ['SSH', 0, 'Remote shell. Fine if password login is off.'],
    23: ['Telnet', 3, 'Unencrypted remote shell, almost always default credentials on IoT/routers.'], 25: ['SMTP', 1, 'Mail server on a LAN device is unusual.'],
    53: ['DNS', 0, ''], 67: ['DHCP', 0, ''], 80: ['HTTP', 0, 'Admin web page, unencrypted.'], 110: ['POP3', 1, 'Plain mail.'], 111: ['RPC', 2, 'Portmapper exposure.'],
    135: ['MS-RPC', 1, ''], 139: ['NetBIOS', 1, 'Legacy Windows sharing.'], 143: ['IMAP', 1, ''], 161: ['SNMP', 2, 'Often public/private community strings.'],
    443: ['HTTPS', 0, ''], 445: ['SMB', 2, 'File sharing. Exposure invites ransomware spread; keep patched, never expose.'],
    515: ['LPD', 1, 'Printer spooler.'], 554: ['RTSP', 2, 'Camera video stream, often unauthenticated.'], 631: ['IPP', 0, 'Printer.'],
    1900: ['UPnP/SSDP', 1, 'Lets devices open router ports automatically. Disable on the router if not needed.'], 1883: ['MQTT', 2, 'IoT broker frequently open without auth.'],
    3306: ['MySQL', 2, 'Database listening on the LAN.'], 3389: ['RDP', 3, 'Remote Desktop: top ransomware entry point.'], 5000: ['UPnP/Synology', 1, ''],
    5353: ['mDNS', 0, ''], 5555: ['ADB', 3, 'Android Debug Bridge open: full device control without a password.'], 5900: ['VNC', 3, 'Remote screen, often weak or no password.'],
    7547: ['TR-069', 2, 'ISP remote management port; historically exploited (Mirai).'], 8000: ['HTTP-alt', 0, ''], 8080: ['HTTP-alt', 0, ''], 8291: ['MikroTik Winbox', 2, ''],
    8443: ['HTTPS-alt', 0, ''], 8554: ['RTSP-alt', 2, 'Camera stream.'], 9100: ['Printer RAW', 1, ''], 37777: ['Dahua DVR', 2, 'DVR/camera service with a history of auth bypass bugs.'],
    62078: ['iOS sync', 0, 'Apple device.'], 8008: ['Chromecast', 0, ''], 8009: ['Cast', 0, ''], 9000: ['HTTP-alt', 0, ''], 49152: ['UPnP', 1, '']
  };
  C.COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 161, 443, 445, 515, 554, 631, 1883, 1900, 3306, 3389, 5000, 5555, 5900, 7547, 8000, 8008, 8009, 8080, 8291, 8443, 8554, 9100, 37777, 49152, 62078];
  C.assessPorts = function (open) { // open: [{port, banner}]
    const out = [];
    for (const o of open) {
      const r = C.PORTS[o.port];
      if (r && r[1] > 0) out.push({ sev: r[1], title: `${r[0]} open (${o.port})`, why: r[2] });
      if (o.banner) {
        const b = o.banner;
        if (/OpenSSH[_ ]([1-6]\.|7\.[0-3])/i.test(b)) out.push({ sev: 2, title: 'Outdated OpenSSH', why: b.slice(0, 80) });
        if (/Boa\/0\./i.test(b)) out.push({ sev: 2, title: 'Boa web server (abandoned, many known CVEs)', why: b.slice(0, 80) });
        if (/GoAhead/i.test(b)) out.push({ sev: 1, title: 'GoAhead embedded web server', why: 'Frequently seen on cameras/routers with unpatched flaws.' });
        if (/mini_httpd|lighttpd\/1\.4\.[0-3]\d?\b/i.test(b)) out.push({ sev: 1, title: 'Old embedded web server', why: b.slice(0, 80) });
        if (/Microsoft-IIS\/[1-6]\./i.test(b)) out.push({ sev: 2, title: 'Very old IIS', why: b.slice(0, 80) });
      }
    }
    out.sort((a, b) => b.sev - a.sev);
    return out;
  };
  C.riskScore = list => Math.min(100, list.reduce((s, x) => s + (x.sev === 3 ? 40 : x.sev === 2 ? 20 : 8), 0));

  C.guessKind = (vendor, name) => {
    const t = ((vendor || '') + ' ' + (name || '')).toLowerCase();
    const has = (...k) => k.some(x => t.includes(x));
    if (has('private/random')) return 'phone';
    if (has('tp-link', 'netgear', 'ubiquiti', 'arris', 'askey', 'technicolor', 'sagemcom', 'actiontec', 'linksys', 'zyxel', 'eero', 'calix', 'commscope', 'cisco', 'mikrotik', 'gateway', 'router', 'modem', 'd-link', 'asustek')) return 'router';
    if (has('hikvision', 'dahua', 'amcrest', 'wyze', 'arlo', 'ring ', 'reolink', 'axis comm', 'lorex', 'swann', 'nest labs', 'camera')) return 'camera';
    if (has('hewlett', 'hp inc', 'canon', 'brother', 'epson', 'xerox', 'lexmark', 'printer', 'kyocera', 'ricoh')) return 'printer';
    if (has('roku', 'vizio', 'lg electronics', 'tcl', 'hisense', 'chromecast', 'amazon technologies', 'fire', ' tv')) return 'tv';
    if (has('sony interactive', 'nintendo', 'xbox', 'playstation')) return 'game';
    if (has('apple', 'samsung', 'xiaomi', 'oneplus', 'huawei', 'oppo', 'motorola', 'google', 'iphone', 'android', 'galaxy', 'pixel')) return 'phone';
    if (has('espressif', 'tuya', 'sonoff', 'shelly', 'philips lighting', 'signify', 'ecobee', 'honeywell', 'lutron', 'sonos', 'iot', 'smart')) return 'iot';
    if (has('intel', 'dell', 'lenovo', 'realtek', 'micro-star', 'gigabyte', 'asrock', 'hon hai', 'foxconn', 'liteon', 'azurewave', 'microsoft', 'acer', 'toshiba', 'desktop', 'laptop')) return 'pc';
    return 'unknown';
  };

  C.fmt = { ms: v => v >= 100 ? Math.round(v) + ' ms' : v >= 10 ? v.toFixed(0) + ' ms' : v.toFixed(1) + ' ms', mbps: v => v >= 100 ? v.toFixed(0) : v.toFixed(1) };

  if (typeof module !== 'undefined' && module.exports) module.exports = C; else root.Core = C;
})(typeof window !== 'undefined' ? window : globalThis);
