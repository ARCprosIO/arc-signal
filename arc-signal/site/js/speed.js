/* Browser speed test (Cloudflare). Design goals: a steady needle and a trustworthy number.
   - parallel streams with long transfers, started staggered, so they never all restart at the same moment
   - throughput is measured over a sliding 1 s window (not 0.2 s snapshots, which bounce around on any network)
   - the first seconds (TCP ramp-up) are shown but never counted
   - the final number is a trimmed mean of the 1 s windows after warm-up (a stall or a burst cannot decide the result)
   - latency probes go to a different host than the load streams, so they never wait in the browser's own queue
   - screen kept awake while testing, and a hidden tab marks the result as unreliable */
(function (root) {
  const cfg = { down: 'https://speed.cloudflare.com/__down?bytes=', up: 'https://speed.cloudflare.com/__up', probe: 'https://1.1.1.1/cdn-cgi/trace?r=', downSize: 100e6, upSize: 8e6 };
  const now = () => performance.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let sepOk = true;

  async function ping1(signal) {
    const t = now();
    if (sepOk) { try { await fetch(cfg.probe + Math.random(), { cache: 'no-store', mode: 'no-cors', signal }); return now() - t; } catch (e) { if (signal && signal.aborted) return -1; sepOk = false; } }
    const t2 = now();
    try { await fetch(cfg.down + '0&r=' + Math.random(), { cache: 'no-store', signal }); return now() - t2; } catch (e) { return -1; }
  }
  async function pingSeries(n, gap, signal) {
    const out = []; for (let i = 0; i < n && !signal.aborted; i++) { out.push(await ping1(signal)); await sleep(gap); } return out;
  }
  const sorted = a => a.filter(x => x >= 0).sort((x, y) => x - y);
  const med = a => { const s = sorted(a); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const pct = (a, p) => { const s = sorted(a); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
  const trimmedMean = (a, cut) => { const s = a.slice().sort((x, y) => x - y); if (!s.length) return 0; const k = s.length >= 6 ? Math.floor(s.length * cut) : 0; const m = s.slice(k, s.length - k); return m.reduce((x, y) => x + y, 0) / m.length; };

  /* Byte counter with a sliding-window rate. */
  function Meter() {
    const pts = []; let total = 0, t0 = now();
    return {
      add(n) { total += n; }, get total() { return total; },
      mark() { pts.push([now(), total]); if (pts.length > 80) pts.shift(); },
      rate(win) { if (pts.length < 2) return 0; const last = pts[pts.length - 1]; let i = pts.length - 1; while (i > 0 && last[0] - pts[i - 1][0] <= win) i--; const a = pts[i], dt = (last[0] - a[0]) / 1e3; return dt > 0.2 ? (last[1] - a[1]) * 8 / dt / 1e6 : 0; },
      reset() { total = 0; pts.length = 0; t0 = now(); }
    };
  }

  /* One measured phase. start(sig, meter) launches the load workers and returns a promise that settles when they stop. */
  async function phase(kind, o, res, cb, start) {
    const ac = new AbortController(), sig = ac.signal, m = Meter(), t0 = now(), secs = o.seconds, loaded = [];
    const workers = start(sig, m);
    const probe = (async () => { while (now() - t0 < secs * 1000 && !sig.aborted) { const v = await ping1(sig); if (v >= 0) { const t = (now() - t0) / 1e3; res.samples.lat.push({ t, v, ph: kind }); if (t > o.warm) loaded.push(v); } await sleep(150); } })();
    const wins = [], bounds = [[0, 0]]; let disp = 0, nextEmit = 250, nextBound = 1000;
    while (now() - t0 < secs * 1000 && !sig.aborted) {
      await sleep(100); m.mark(); const el = now() - t0;
      if (el >= nextEmit) {
        nextEmit += 250; const r = m.rate(1000); disp += (r - disp) * 0.45;           // light smoothing on top of the 1 s window
        cb.speed(disp, kind, el / 1e3); res.samples[kind === 'down' ? 'down' : 'up'].push({ t: el / 1e3, v: disp });
      }
      if (el >= nextBound) { const prev = bounds[bounds.length - 1]; const dt = (el - prev[0]) / 1e3; const rate = (m.total - prev[1]) * 8 / dt / 1e6; bounds.push([el, m.total]); if (el / 1e3 > o.warm + 0.5) wins.push(rate); nextBound += 1000; }
    }
    ac.abort(); await Promise.allSettled([probe, workers]);
    const win = wins.length >= 2 ? wins : null;
    const speed = win ? trimmedMean(win, 0.1) : (m.total * 8 / ((now() - t0) / 1e3) / 1e6);
    const mean = win ? win.reduce((a, b) => a + b, 0) / win.length : speed, sd = win ? Math.sqrt(win.reduce((a, b) => a + (b - mean) * (b - mean), 0) / win.length) : 0;
    return { speed, peak: win ? Math.max(...win) : speed, low: win ? Math.min(...win) : speed, cv: mean > 0 ? sd / mean : 0, wins: win || [], loaded };
  }

  /* cb: {phase(name), speed(mbps, phase, seconds), latency(ms, phase)} */
  async function run(cb, opts) {
    const o = Object.assign({ seconds: 9, streams: 6, upStreams: 3, warm: 2 }, opts || {});
    const res = { samples: { down: [], up: [], lat: [] }, down: 0, up: 0, idle: 0, loadDown: 0, loadUp: 0, jitter: 0, at: Date.now(), server: 'Cloudflare', seconds: o.seconds };
    const ac0 = new AbortController(); let lock = null, hidden = false;
    const vis = () => { if (document.hidden) hidden = true; }; document.addEventListener('visibilitychange', vis);
    try { if (navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch (e) {}
    try {
      /* ---- idle latency */
      cb.phase('Latency'); const all = await pingSeries(18, 100, ac0.signal), idle = all.slice(2).filter(x => x >= 0);   // first two include connection set-up
      if (idle.length < 5) throw new Error('Could not reach the test server. Check your connection and try again.');
      res.idle = med(idle); res.idleMin = Math.min(...idle);
      const diffs = []; for (let i = 1; i < idle.length; i++) diffs.push(Math.abs(idle[i] - idle[i - 1]));
      res.jitter = trimmedMean(diffs, 0.1) || 0; res.jitterRaw = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
      cb.latency(res.idle, 'idle');

      /* ---- download: long transfers, staggered, never all restarting together */
      cb.phase('Download');
      const d = await phase('down', o, res, cb, (sig, m) => Promise.all(Array.from({ length: o.streams }, async (_, i) => {
        await sleep(i * 120); let size = cfg.downSize;
        while (!sig.aborted) {
          try {
            const r = await fetch(cfg.down + size + '&r=' + Math.random(), { cache: 'no-store', signal: sig });
            if (!r.ok) { size = 25e6; await sleep(300); continue; }
            const rd = r.body.getReader(); while (true) { const { done, value } = await rd.read(); if (done) break; m.add(value.length); if (sig.aborted) { rd.cancel(); break; } }
          } catch (e) { if (sig.aborted) return; await sleep(250); }
        }
      })));
      Object.assign(res, { down: d.speed, downPeak: d.peak, downLow: d.low, downCv: d.cv, nDown: d.loaded.length, loadDown: med(d.loaded), loadDownP95: pct(d.loaded, 0.95) });
      cb.latency(res.loadDown, 'down');

      /* ---- upload */
      cb.phase('Upload');
      const chunk = new Uint8Array(65536); crypto.getRandomValues(chunk); const blob = new Blob(Array(Math.round(cfg.upSize / 65536)).fill(chunk));
      const xhrs = new Set();
      const u = await phase('up', o, res, cb, (sig, m) => Promise.all(Array.from({ length: o.upStreams }, async (_, i) => {
        await sleep(i * 150);
        while (!sig.aborted) {
          await new Promise(done => { const x = new XMLHttpRequest(); xhrs.add(x); let prev = 0;
            x.open('POST', cfg.up + '?r=' + Math.random()); x.upload.onprogress = e => { m.add(e.loaded - prev); prev = e.loaded; };
            x.onloadend = () => { if (x.status && prev < blob.size) m.add(blob.size - prev); xhrs.delete(x); done(); };
            sig.addEventListener('abort', () => { try { x.abort(); } catch (e) {} done(); }, { once: true });
            x.send(blob); });
        }
      })));
      xhrs.forEach(x => { try { x.abort(); } catch (e) {} });
      Object.assign(res, { up: u.speed, upPeak: u.peak, upLow: u.low, upCv: u.cv, nUp: u.loaded.length, loadUp: med(u.loaded), loadUpP95: pct(u.loaded, 0.95) });
      cb.latency(res.loadUp, 'up');
    } finally { document.removeEventListener('visibilitychange', vis); try { lock && lock.release(); } catch (e) {} }
    res.bloatDown = res.loadDown ? Math.max(0, res.loadDown - res.idle) : null; res.bloatUp = res.loadUp ? Math.max(0, res.loadUp - res.idle) : null;
    res.bloat = Math.max(res.bloatDown || 0, res.bloatUp || 0);
    res.sepProbe = sepOk; res.interrupted = hidden;
    res.noisy = res.jitter > 20 || Math.min(res.nDown || 0, res.nUp || 0) < 8 || hidden;   // too noisy / too few samples / tab was hidden
    cb.phase('Done'); return res;
  }

  /* quick download-only sample for the walk survey */
  async function quick(seconds) {
    seconds = seconds || 4; const ac = new AbortController(); const m = Meter(); const t0 = now();
    const w = async i => { await sleep(i * 100); try { const r = await fetch(cfg.down + 25e6 + '&r=' + Math.random(), { cache: 'no-store', signal: ac.signal }); const rd = r.body.getReader();
      while (now() - t0 < seconds * 1000) { const { done, value } = await rd.read(); if (done) break; m.add(value.length); } rd.cancel(); } catch (e) {} };
    await Promise.all([w(0), w(1), w(2)]); ac.abort(); return m.total * 8 / ((now() - t0) / 1e3) / 1e6;
  }
  root.Speed = { run, quick, ping1, pingSeries, cfg };
})(window);
