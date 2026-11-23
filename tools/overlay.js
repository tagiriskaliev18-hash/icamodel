// Overlay the outline traced from the floor plan onto the satellite mosaic under two
// orientation hypotheses, so the real arrangement can be read off instead of guessed.
//   node overlay.js <mosaic> <outA> <outB> <hx> <hy> <rotDeg> <zoom>
const sharp = require('sharp');
const fs = require('fs');

const [mosaic, outA, outB, hxA, hyA, rotA, zoomA] = process.argv.slice(2);
const HX = +hxA, HY = +hyA, ROT = (+rotA || 0) * Math.PI / 180, Z = +zoomA || 6;
const MPP = 0.187;                      // metres per mosaic pixel at zoom 19
const PPM = Z / MPP;                    // overlay pixels per metre

const az = (r, deg) => { const a = deg * Math.PI / 180; return [Math.sin(a) * r, -Math.cos(a) * r]; };
// sheet outlines in metres from the hall centre: x right, y down (south)
function outline() {
  const p = [];
  const circle = (r, a0 = 0, a1 = 360) => { const s = []; for (let a = a0; a <= a1; a += 3) s.push(az(r, a)); p.push(s); };
  circle(5.7); circle(1.28);
  circle(10.3, 0, 180); p.push([az(10.3, 0), az(5.7, 0)]); p.push([az(10.3, 180), az(5.7, 180)]);
  p.push([[-33.4, -7.66], [-9.5, -7.66], [-9.5, 6.62], [-33.4, 6.62], [-33.4, -7.66]]);
  const wa = 46.4 * Math.PI / 180, ax = [Math.sin(wa), -Math.cos(wa)], nx = [-ax[1], ax[0]];
  const quad = [];
  for (const [s, t] of [[4, -7.12], [34.5, -7.12], [34.5, 7.12], [4, 7.12], [4, -7.12]]) quad.push([ax[0] * s + nx[0] * t, ax[1] * s + nx[1] * t]);
  p.push(quad);
  circle(15.1, 245, 378); circle(19.5, 245, 378);
  p.push([az(5.7, 245), az(19.5, 245)]); p.push([az(5.7, 18), az(19.5, 18)]);
  return p;
}
const SHEET = outline();
const HYP = {
  rotate: ([x, y]) => [-x, -y],          // sheet turned 180 degrees
  mirror: ([x, y]) => [-x, y],           // sheet reflected left-right
};
function svgFor(name, W, Hh, cx, cy) {
  const f = HYP[name];
  const toPx = ([x, y]) => {
    const [X, Zz] = f([x, y]);                        // world: X east, Z south
    const xr = X * Math.cos(ROT) - Zz * Math.sin(ROT), yr = X * Math.sin(ROT) + Zz * Math.cos(ROT);
    return [cx + xr * PPM, cy + yr * PPM];
  };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}">`;
  for (const poly of SHEET) {
    const pts = poly.map((q) => toPx(q).map((v) => v.toFixed(1)).join(',')).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="#ff2020" stroke-width="3" opacity="0.95"/>`;
  }
  // the two terrace stairs and the tambour, marked so the entrance side is obvious
  for (const [r, col] of [[18.8, '#ffee00'], [12, '#ff80ff']]) {
    const [px, py] = toPx(r === 18.8 ? az(r, 338) : az(r, 336));
    s += `<circle cx="${px}" cy="${py}" r="14" fill="${col}" stroke="#000" stroke-width="2"/>`;
  }
  const [hx, hy] = toPx([0, 0]);
  s += `<path d="M${hx - 30} ${hy}H${hx + 30}M${hx} ${hy - 30}V${hy + 30}" stroke="#00ffff" stroke-width="3"/></svg>`;
  return Buffer.from(s);
}
(async () => {
  const W = +process.env.W || 230, Hh = +process.env.H || 190;                              // mosaic pixels around the hall centre
  const left = Math.round(HX - W / 2), top = Math.round(HY - Hh / 2);
  const base = await sharp(mosaic).extract({ left, top, width: W, height: Hh }).resize(W * Z, Hh * Z, { kernel: 'lanczos3' })
    .modulate({ saturation: 1.3 }).sharpen().toBuffer();
  const cx = (HX - left) * Z, cy = (HY - top) * Z;
  for (const name of ['rotate', 'mirror']) {
    const out = name === 'rotate' ? outA : outB;
    await sharp(base).composite([{ input: svgFor(name, W * Z, Hh * Z, cx, cy) }]).jpeg({ quality: 90 }).toFile(out);
    console.log(out, `${W * Z}x${Hh * Z}`);
  }
})();
