/* Browser speed test: Cloudflare, parallel streams, warm-up discarded, latency under load -> bufferbloat. */
(function (root) {
  const DL = 'https://speed.cloudflare.com/__down?bytes=', UP = 'https://speed.cloudflare.com/__up';
  const now = () => performance.now();
  /* Latency probes go to a DIFFERENT host than the load streams, so a probe never waits in the browser's own queue
     behind our downloads (that waiting is a measurement artifact, not router bufferbloat). Falls back to the same host if blocked. */
  const PROBE = 'https://1.1.1.1/cdn-cgi/trace?r='; let sepOk = true;
  async function ping1(signal) {
    const t = now();
    if (sepOk) { try { await fetch(PROBE + Math.random(), { cache: 'no-store', mode: 'no-cors', signal }); return now() - t; } catch (e) { if (signal && signal.aborted) return -1; sepOk = false; } }
    const t2 = now();
    try { await fetch(DL + '0&r=' + Math.random(), { cache: 'no-store', signal }); return now() - t2; } catch (e) { return -1; }
  }
  async function pingSeries(n, gap, signal) {
    const out = []; for (let i = 0; i < n && !signal.aborted; i++) { out.push(await ping1(signal)); await new Promise(r => setTimeout(r, gap)); } return out;
  }
  const med = a => { const s = a.filter(x => x >= 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  /* cb: {phase(name), speed(mbps, phase), latency(ms, phase)} */
  async function run(cb, opts) {
    opts = Object.assign({ seconds: 8, streams: 6, warm: 1.5 }, opts || {});
    const ac = new AbortController(), sig = ac.signal;
    const res = { samples: { down: [], up: [], lat: [] }, down: 0, up: 0, idle: 0, loadDown: 0, loadUp: 0, jitter: 0, at: Date.now(), server: 'Cloudflare' };
    const stop = () => ac.abort();
    try {
      cb.phase('Latency'); const idleAll = await pingSeries(16, 120, sig), idle = idleAll.slice(2);   // first two include connection set-up
      res.idle = med(idle); res.idleMin = Math.min(...idle.filter(x => x >= 0));
      const ok = idle.filter(x => x >= 0); let js = 0; for (let i = 1; i < ok.length; i++) js += Math.abs(ok[i] - ok[i - 1]); res.jitter = ok.length > 1 ? js / (ok.length - 1) : 0;
      cb.latency(res.idle, 'idle');

      // ---- download
      cb.phase('Download');
      let bytes = 0, base = 0, baseT = 0; const t0 = now(); const loaded = [];
      const worker = async () => { while (!sig.aborted && now() - t0 < opts.seconds * 1000) {
        try { const r = await fetch(DL + 25e6 + '&r=' + Math.random(), { cache: 'no-store', signal: sig }); const rd = r.body.getReader();
          while (true) { const { done, value } = await rd.read(); if (done) break; bytes += value.length; if (now() - t0 > opts.seconds * 1000) { rd.cancel(); break; } } } catch (e) { if (sig.aborted) return; await new Promise(r => setTimeout(r, 200)); } } };
      const ws = Array.from({ length: opts.streams }, worker);
      let lastB = 0, lastT = t0;
      const lat = (async () => { while (now() - t0 < opts.seconds * 1000 && !sig.aborted) { const v = await ping1(sig); if (v >= 0) res.samples.lat.push({ t: (now() - t0) / 1e3, v, ph: 'down' }); if (v >= 0 && now() - t0 > 1500) loaded.push(v); await new Promise(r => setTimeout(r, 150)); } })();
      while (now() - t0 < opts.seconds * 1000 && !sig.aborted) {
        await new Promise(r => setTimeout(r, 200)); const t = now();
        if (!baseT && (t - t0) / 1000 >= opts.warm) { base = bytes; baseT = t; }
        const mb = (bytes - lastB) * 8 / ((t - lastT) / 1e3) / 1e6; cb.speed(mb, 'down'); res.samples.down.push({ t: (t - t0) / 1e3, v: mb }); lastB = bytes; lastT = t;
      }
      const tEnd = now(); await Promise.allSettled([lat]);
      res.down = baseT ? (bytes - base) * 8 / ((tEnd - baseT) / 1e3) / 1e6 : bytes * 8 / ((tEnd - t0) / 1e3) / 1e6;
      res.nDown = loaded.length; res.loadDown = med(loaded); cb.latency(res.loadDown, 'down');
      ac.abort(); await Promise.allSettled(ws);
    } catch (e) { if (!sig.aborted) throw e; }
    // new controller for upload
    const ac2 = new AbortController(); const s2 = ac2.signal;
    try {
      cb.phase('Upload');
      const chunk = new Uint8Array(65536); crypto.getRandomValues(chunk);
      const blob = new Blob(Array(48).fill(chunk));    // ~3 MB
      let sent = 0, base = 0, baseT = 0; const t0 = now(); const loaded = [];
      const xhrs = new Set();
      const worker = async () => { while (!s2.aborted && now() - t0 < opts.seconds * 1000) {
        await new Promise(res => { const x = new XMLHttpRequest(); xhrs.add(x); let prev = 0;
          x.open('POST', UP + '?r=' + Math.random()); x.upload.onprogress = e => { sent += e.loaded - prev; prev = e.loaded; };
          x.onloadend = () => { if (x.status && prev < blob.size) sent += blob.size - prev; xhrs.delete(x); res(); }; x.send(blob); }); } };
      const ws = Array.from({ length: 4 }, worker);
      const lat = (async () => { while (now() - t0 < opts.seconds * 1000 && !s2.aborted) { const v = await ping1(s2); if (v >= 0) res.samples.lat.push({ t: (now() - t0) / 1e3, v, ph: 'up' }); if (v >= 0 && now() - t0 > 1500) loaded.push(v); await new Promise(r => setTimeout(r, 150)); } })();
      let lastB = 0, lastT = t0;
      while (now() - t0 < opts.seconds * 1000) {
        await new Promise(r => setTimeout(r, 200)); const t = now();
        if (!baseT && (t - t0) / 1000 >= opts.warm) { base = sent; baseT = t; }
        const mb = (sent - lastB) * 8 / ((t - lastT) / 1e3) / 1e6; cb.speed(mb, 'up'); res.samples.up.push({ t: (t - t0) / 1e3, v: mb }); lastB = sent; lastT = t;
      }
      const tEnd = now(); await Promise.allSettled([lat]);
      res.up = baseT ? (sent - base) * 8 / ((tEnd - baseT) / 1e3) / 1e6 : sent * 8 / ((tEnd - t0) / 1e3) / 1e6;
      res.nUp = loaded.length; res.loadUp = med(loaded); cb.latency(res.loadUp, 'up');
      ac2.abort(); xhrs.forEach(x => x.abort()); await Promise.allSettled(ws);
    } catch (e) { ac2.abort(); throw e; }
    res.bloatDown = res.loadDown ? Math.max(0, res.loadDown - res.idle) : null; res.bloatUp = res.loadUp ? Math.max(0, res.loadUp - res.idle) : null;
    res.bloat = Math.max(res.bloatDown || 0, res.bloatUp || 0);
    res.sepProbe = sepOk;
    res.noisy = res.jitter > 20 || Math.min(res.nDown || 0, res.nUp || 0) < 8;   // too noisy / too few samples to trust the grade
    cb.phase('Done'); return res;
  }
  /* quick download-only sample for the walk survey */
  async function quick(seconds) {
    seconds = seconds || 4; const ac = new AbortController(); let bytes = 0; const t0 = now();
    const w = async () => { try { const r = await fetch(DL + 25e6 + '&r=' + Math.random(), { cache: 'no-store', signal: ac.signal }); const rd = r.body.getReader();
      while (now() - t0 < seconds * 1000) { const { done, value } = await rd.read(); if (done) break; bytes += value.length; } rd.cancel(); } catch (e) {} };
    await Promise.all([w(), w(), w()]); ac.abort(); return bytes * 8 / ((now() - t0) / 1e3) / 1e6;
  }
  root.Speed = { run, quick, ping1, pingSeries };
})(window);
