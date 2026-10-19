// Copies ../site into ./www (the web app is the single source of truth) and drops the PWA-only bits.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', '..', 'site'), dst = path.join(__dirname, '..', 'www');
fs.rmSync(dst, { recursive: true, force: true });
(function copy(a, b) { fs.mkdirSync(b, { recursive: true });
  for (const f of fs.readdirSync(a)) { if (f === '.htaccess' || f === 'sw.js') continue;
    const s = path.join(a, f), d = path.join(b, f); fs.statSync(s).isDirectory() ? copy(s, d) : fs.copyFileSync(s, d); } })(src, dst);
// Capacitor bridge script must load before our code
const idx = path.join(dst, 'index.html');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('<script src="js/core.js">', '<script src="js/core.js">'));
console.log('web synced to www');
