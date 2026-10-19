/* Bridge to the platform: Android plugin (NetScan), the Windows desktop app (ArcPC), or nothing (plain browser). */
(function (root) {
  const cap = root.Capacitor, pc = root.ArcPC && root.ArcPC.isDesktop ? root.ArcPC : null;
  const plugin = cap && cap.Plugins && cap.Plugins.NetScan;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && plugin), isDesktop = !!pc;
  /* one-time cleanup of any sample data left behind by earlier builds */
  try { if (!localStorage.getItem('nd_clean1')) { ['nd_demo', 'nd_known', 'nd_watch', 'nd_events', 'nd_rooms'].forEach(k => localStorage.removeItem(k)); localStorage.setItem('nd_clean1', '1'); } } catch (e) {}
  const N = {
    isNative, isDesktop, demo: false, setDemo() {},
    get mode() { return isNative ? 'native' : isDesktop ? 'desktop' : 'web'; },
    get live() { return isNative || isDesktop; },
    has(m) { return isNative || (isDesktop && !['_none'].includes(m)); },
    async call(method, args) {
      if (isNative) return plugin[method](args || {});
      if (isDesktop) { const { _cb, ...rest } = args || {}; return pc.call(method, rest); }
      const e = new Error('Needs the Android or Windows app'); e.code = 'WEB_ONLY'; throw e;
    },
    on(evt, fn) { if (isNative) return plugin.addListener(evt, fn); if (isDesktop) return pc.on(evt, fn); return { remove() {} }; }
  };
  root.Native = N;
})(window);
