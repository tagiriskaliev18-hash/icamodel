// Crop, rotate and scale a reference image, then print a labelled grid in SOURCE pixel
// coordinates so measurements can be read straight off the picture.
//   node refcrop.js <in> <out> <rotateDeg> <x> <y> <w> <h> <scale> [gridPx]
// rotateDeg is applied first (clockwise); x y w h describe the crop in the rotated image.
const sharp = require('sharp');

const [inPath, outPath, rotArg, xA, yA, wA, hA, sA, gA] = process.argv.slice(2);
const rot = Number(rotArg) || 0, x = +xA, y = +yA, w = +wA, h = +hA, scale = +sA, grid = gA ? +gA : 0;

(async () => {
  let img = sharp(inPath, { limitInputPixels: 1e12 });
  const meta = await img.metadata();
  let W = meta.width, H = meta.height;
  if (rot === 90) img = img.rotate(90); else if (rot === 180) img = img.rotate(180); else if (rot === 270) img = img.rotate(270);
  if (rot === 90 || rot === 270) [W, H] = [H, W];
  const cx = Math.max(0, x), cy = Math.max(0, y);
  const cw = Math.min(w, W - cx), ch = Math.min(h, H - cy);
  const ow = Math.round(cw * scale), oh = Math.round(ch * scale);
  const base = await img.extract({ left: cx, top: cy, width: cw, height: ch })
    .resize(ow, oh, { kernel: 'lanczos3' }).toBuffer({ resolveWithObject: true });

  let svg = '';
  if (grid) {
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${ow}" height="${oh}">`;
    const fs = Math.max(11, Math.min(16, Math.round(scale * 9)));
    for (let gx = Math.ceil(cx / grid) * grid; gx < cx + cw; gx += grid) {
      const px = ((gx - cx) * scale).toFixed(1);
      const major = gx % (grid * 5) === 0;
      s += `<line x1="${px}" y1="0" x2="${px}" y2="${oh}" stroke="${major ? '#ff2d2d' : '#2d8cff'}" stroke-width="${major ? 1.4 : 0.7}" opacity="0.75"/>`;
      s += `<text x="${+px + 2}" y="${fs}" font-size="${fs}" fill="#ffe600" stroke="#000" stroke-width="2" paint-order="stroke" font-family="Arial">${gx}</text>`;
    }
    for (let gy = Math.ceil(cy / grid) * grid; gy < cy + ch; gy += grid) {
      const py = ((gy - cy) * scale).toFixed(1);
      const major = gy % (grid * 5) === 0;
      s += `<line x1="0" y1="${py}" x2="${ow}" y2="${py}" stroke="${major ? '#ff2d2d' : '#2d8cff'}" stroke-width="${major ? 1.4 : 0.7}" opacity="0.75"/>`;
      s += `<text x="2" y="${+py - 2}" font-size="${fs}" fill="#ffe600" stroke="#000" stroke-width="2" paint-order="stroke" font-family="Arial">${gy}</text>`;
    }
    svg = s + '</svg>';
  }
  let out = sharp(base.data).flatten({ background: '#ffffff' });
  if (svg) out = out.composite([{ input: Buffer.from(svg) }]);
  await out.jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toFile(outPath);
  console.log(`${outPath}  src ${meta.width}x${meta.height} -> rot ${W}x${H}, crop ${cx},${cy} ${cw}x${ch}, out ${ow}x${oh}`);
})().catch((e) => { console.error(e); process.exit(1); });
