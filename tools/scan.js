// Measure a scanned drawing: walk along a segment and report where it crosses dark lines.
//   node scan.js <image> <rotateDeg> "<spec>" "<spec>" ...
// spec: x0,y0,x1,y1[,thr[,minRun]]  in pixels of the ROTATED image. Output lists dark runs
// as distance along the segment plus the midpoint, so walls, radii and spacings can be read
// to the pixel instead of by eye.
const sharp = require('sharp');

const [imgPath, rotArg, ...specs] = process.argv.slice(2);
const rot = Number(rotArg) || 0;
const THR = 105;

(async () => {
  let img = sharp(imgPath, { limitInputPixels: 1e12 }).rotate(rot);
  const { data, info } = await img.greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  console.log(`image ${W}x${H} (rot ${rot})`);
  const lum = (x, y) => data[Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0))];

  for (const spec of specs) {
    const p = spec.split(',').map(Number);
    const [x0, y0, x1, y1] = p, thr = p[4] ?? THR, minRun = p[5] ?? 2;
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len));
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy, ny = ux;
    const runs = [];
    let start = -1;
    for (let i = 0; i <= n; i++) {
      // average across +-1.5 px perpendicular to the line so a thin anti-aliased line is not missed
      let s = 0, c = 0;
      for (let k = -2; k <= 2; k++, c++) s += lum(x0 + ux * i + nx * k, y0 + uy * i + ny * k);
      const dark = s / c < thr;
      if (dark && start < 0) start = i;
      if ((!dark || i === n) && start >= 0) {
        const end = dark && i === n ? i : i - 1;
        if (end - start + 1 >= minRun) runs.push([start, end]);
        start = -1;
      }
    }
    // merge runs separated by gaps under 3 px (hatching inside a wall reads as one thick run)
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r[0] - last[1] <= 3) last[1] = r[1]; else merged.push([r[0], r[1]]);
    }
    const txt = merged.map(([a, b]) => {
      const m = (a + b) / 2;
      return `${m.toFixed(0)}(${x0 + ux * m | 0},${y0 + uy * m | 0})w${b - a + 1}`;
    }).join('  ');
    console.log(`[${x0},${y0}->${x1},${y1}] len ${len.toFixed(0)}: ${txt}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
