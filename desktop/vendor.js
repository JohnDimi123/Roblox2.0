// Vendors Three.js into the client so the packaged desktop app runs fully
// offline. Downloads the ESM build to client/vendor and rewrites the import
// map in index.html to point at the local copy.
const fs = require('fs');
const path = require('path');
const https = require('https');

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const clientDir = path.join(__dirname, '..', 'client');
const vendorDir = path.join(clientDir, 'vendor');
const target = path.join(vendorDir, 'three.module.js');
const indexHtml = path.join(clientDir, 'index.html');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
    }).on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(vendorDir, { recursive: true });
  console.log('Downloading three.js …');
  await download(THREE_URL, target);
  console.log('Saved', target);

  let html = fs.readFileSync(indexHtml, 'utf8');
  html = html.replace(
    /"three":\s*"[^"]*"/,
    '"three": "/vendor/three.module.js"'
  );
  fs.writeFileSync(indexHtml, html);
  console.log('Rewrote import map -> /vendor/three.module.js (offline ready).');
})().catch((e) => { console.error('vendor failed:', e.message); process.exit(1); });
