// Fetch a tile mosaic around a lat/lon from a map source and stitch it into one JPEG,
// with a metre grid so the footprint can be measured. Reference use only; tiles are not shipped.
//   node tiles.js <outDir> <lat> <lon> <zoom> <halfTiles> [source]
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const [outDir, latA, lonA, zA, halfA, srcA] = process.argv.slice(2);
const SRC = {
  esri: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  google: (z, x, y) => `https://mt1.google.com/vt?lyrs=s&x=${x}&y=${y}&z=${z}`,
  gmap: (z, x, y) => `https://mt1.google.com/vt?lyrs=m&x=${x}&y=${y}&z=${z}`,
  yandex: (z, x, y) => `https://core-renderer-tiles.maps.yandex.net/tiles?l=sat&x=${x}&y=${y}&z=${z}&scale=1&lang=ru_RU`,
  osm: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
};
const tag = srcA || 'esri';
const src = SRC[tag] || SRC.esri;
const lat = +latA, lon = +lonA, z = +zA, half = +halfA;
const n = 2 ** z;
const xf = ((lon + 180) / 360) * n;
const rad = (lat * Math.PI) / 180;
const yf = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
const x0 = Math.floor(xf) - half, y0 = Math.floor(yf) - half, N = half * 2 + 1;
const mpp = (156543.03392 * Math.cos(rad)) / n;   // metres per pixel at this latitude

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const comps = [];
  let failed = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + i, y = y0 + j;
    const file = path.join(outDir, `t_${tag}_${z}_${x}_${y}.bin`);
    let ok = fs.existsSync(file) && fs.statSync(file).size > 400;
    for (let attempt = 0; !ok && attempt < 3; attempt++) {
      try {
        const r = await fetch(src(z, x, y), { headers: { 'User-Agent': 'Mozilla/5.0 (reference-fetch)', Referer: 'https://www.openstreetmap.org/' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 400) throw new Error('tiny response');
        fs.writeFileSync(file, buf); ok = true;
      } catch (e) { if (attempt === 2) { failed++; console.error('fail', tag, x, y, e.message); } await new Promise((r2) => setTimeout(r2, 600)); }
    }
    if (ok) comps.push({ input: file, left: i * 256, top: j * 256 });
  }
  if (!comps.length) { console.log(`${tag} z${z}: no tiles`); return; }
  const S = N * 256;
  const cx = (xf - x0) * 256, cy = (yf - y0) * 256;      // the geocoded point in mosaic pixels
  const px = 10 / mpp;                                   // grid every 10 m
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">`;
  for (let k = Math.ceil((0 - cx) / px) * 10; cx + (k / 10) * px < S; k += 10) {
    const p = cx + (k / 10) * px, major = k % 50 === 0;
    svg += `<line x1="${p}" y1="0" x2="${p}" y2="${S}" stroke="${major ? '#ff2020' : '#30b4ff'}" stroke-width="${major ? 2 : 1}" opacity="0.8"/>`;
    if (major) svg += `<text x="${p + 3}" y="22" font-size="20" fill="#ffea00" stroke="#000" stroke-width="4" paint-order="stroke" font-family="Arial">${k > 0 ? '+' : ''}${k} м</text>`;
  }
  for (let k = Math.ceil((0 - cy) / px) * 10; cy + (k / 10) * px < S; k += 10) {
    const p = cy + (k / 10) * px, major = k % 50 === 0;
    svg += `<line x1="0" y1="${p}" x2="${S}" y2="${p}" stroke="${major ? '#ff2020' : '#30b4ff'}" stroke-width="${major ? 2 : 1}" opacity="0.8"/>`;
    if (major) svg += `<text x="4" y="${p - 4}" font-size="20" fill="#ffea00" stroke="#000" stroke-width="4" paint-order="stroke" font-family="Arial">${k > 0 ? '+' : ''}${k} м</text>`;
  }
  svg += `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="#ff00ff" stroke-width="3"/></svg>`;
  const out = path.join(outDir, `mosaic_${tag}_z${z}.jpg`);
  await sharp({ create: { width: S, height: S, channels: 3, background: '#202020' } })
    .composite(comps).jpeg({ quality: 92 }).toFile(out);
  await sharp(out).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 90 }).toFile(path.join(outDir, `grid_${tag}_z${z}.jpg`));
  console.log(`${tag} z${z}: ${S}x${S}px, ${mpp.toFixed(3)} m/px, spans ${(S * mpp).toFixed(0)} m, tiles x${x0}..${x0 + N - 1} y${y0}..${y0 + N - 1}, failed ${failed}; centre px ${cx.toFixed(0)},${cy.toFixed(0)}`);
})();
