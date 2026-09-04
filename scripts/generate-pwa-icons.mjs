import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.resolve("public");

const clamp = (v, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
const lerpColor = (a, b, t) => a.map((v, i) => Math.round(mix(v, b[i], t)));

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return out;
}

function encodePng(width, height, rgba) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    rows[row] = 0;
    rgba.copy(rows, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    chunk("IEND"),
  ]);
}

function paint(canvas, x, y, color, alpha = 1) {
  const { width, height, data } = canvas;
  if (x < 0 || y < 0 || x >= width || y >= height || alpha <= 0) return;
  const i = (y * width + x) * 4;
  const a = clamp(alpha, 0, 1);
  data[i] = Math.round(data[i] * (1 - a) + color[0] * a);
  data[i + 1] = Math.round(data[i + 1] * (1 - a) + color[1] * a);
  data[i + 2] = Math.round(data[i + 2] * (1 - a) + color[2] * a);
  data[i + 3] = 255;
}

function ellipse(canvas, cx, cy, rx, ry, top, bottom, edge = 2) {
  const minX = Math.max(0, Math.floor(cx - rx - edge));
  const maxX = Math.min(canvas.width - 1, Math.ceil(cx + rx + edge));
  const minY = Math.max(0, Math.floor(cy - ry - edge));
  const maxY = Math.min(canvas.height - 1, Math.ceil(cy + ry + edge));
  for (let y = minY; y <= maxY; y++) {
    const ty = clamp((y - (cy - ry)) / (2 * ry), 0, 1);
    const color = lerpColor(top, bottom, ty);
    for (let x = minX; x <= maxX; x++) {
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      paint(canvas, x, y, color, clamp((1 - d) * edge, 0, 1));
    }
  }
}

function rotatedEllipse(canvas, cx, cy, rx, ry, angle, color, edge = 2) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const r = Math.ceil(Math.max(rx, ry) + edge);
  for (let y = Math.max(0, cy - r); y <= Math.min(canvas.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(canvas.width - 1, cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      const px = dx * c + dy * s;
      const py = -dx * s + dy * c;
      const d = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2);
      paint(canvas, x, y, color, clamp((1 - d) * edge, 0, 1));
    }
  }
}

function roundedRect(canvas, x0, y0, x1, y1, radius, color) {
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const qx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
      const qy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
      const outside = Math.hypot(qx, qy) - radius;
      paint(canvas, x, y, color, clamp(1 - outside, 0, 1));
    }
  }
}

function render(size) {
  const scale = size / 512;
  const canvas = { width: size, height: size, data: Buffer.alloc(size * size * 4) };
  const S = (v) => v * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / size - 0.5) * 2;
      const ny = (y / size - 0.45) * 2;
      const vignette = clamp(Math.hypot(nx, ny) / 1.45, 0, 1);
      const color = lerpColor([35, 38, 35], [12, 15, 14], vignette);
      paint(canvas, x, y, color, 1);
    }
  }

  ellipse(canvas, S(256), S(360), S(164), S(77), [247, 193, 105], [170, 92, 33], S(4));
  ellipse(canvas, S(256), S(348), S(151), S(48), [255, 222, 157], [222, 139, 57], S(3));
  roundedRect(canvas, S(108), S(306), S(404), S(337), S(15), [43, 113, 54]);
  roundedRect(canvas, S(122), S(318), S(392), S(343), S(12), [77, 139, 47]);
  ellipse(canvas, S(257), S(278), S(137), S(92), [244, 177, 56], [177, 90, 18], S(4));
  ellipse(canvas, S(249), S(260), S(119), S(67), [255, 200, 77], [218, 125, 25], S(3));
  ellipse(canvas, S(256), S(174), S(172), S(103), [255, 194, 91], [174, 73, 20], S(4));
  ellipse(canvas, S(246), S(149), S(150), S(70), [255, 218, 139], [235, 132, 42], S(3));
  rotatedEllipse(canvas, S(207), S(122), S(77), S(24), -0.2, [255, 235, 184], S(3));

  const crumbs = [
    [160, 321, 9], [181, 326, 6], [203, 316, 7], [225, 329, 5], [246, 318, 8],
    [269, 329, 6], [291, 316, 7], [314, 327, 5], [337, 318, 8], [357, 329, 6],
    [184, 207, 6], [208, 213, 5], [230, 203, 7], [280, 207, 6], [307, 214, 5], [335, 206, 7],
  ];
  for (const [x, y, r] of crumbs) ellipse(canvas, S(x), S(y), S(r), S(r * 0.72), [220, 70, 19], [126, 34, 11], S(2));

  for (const [x, y] of [[194, 264], [221, 295], [255, 245], [285, 285], [322, 266], [301, 309]]) {
    rotatedEllipse(canvas, S(x), S(y), S(7), S(3), -0.5, [47, 113, 47], S(2));
  }

  const chilli = [[118, 320], [143, 306], [170, 299], [199, 301], [227, 311]];
  for (let i = 0; i < chilli.length - 1; i++) {
    const [ax, ay] = chilli[i], [bx, by] = chilli[i + 1];
    for (let j = 0; j <= 18; j++) {
      const t = j / 18;
      ellipse(canvas, S(mix(ax, bx, t)), S(mix(ay, by, t)), S(8.5), S(6.2), [100, 176, 50], [26, 96, 35], S(2));
    }
  }
  rotatedEllipse(canvas, S(111), S(320), S(18), S(6), -0.9, [71, 145, 42], S(2));
  return encodePng(size, size, canvas.data);
}

fs.mkdirSync(OUT, { recursive: true });
const touch = render(180);
fs.writeFileSync(path.join(OUT, "icon-180.png"), touch);
fs.writeFileSync(path.join(OUT, "apple-touch-icon.png"), touch);
fs.writeFileSync(path.join(OUT, "icon-192.png"), render(192));
fs.writeFileSync(path.join(OUT, "icon-512.png"), render(512));
console.log("Generated TripOS PWA icons: 180, 192, 512");
