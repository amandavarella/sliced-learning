// Writes the toolbar icons to src/icons from the app's LogoMark
// (client/src/components/Icons.jsx): a rounded square with a diagonal
// purple-to-pink gradient and three white bars. Plain Node, no image
// libraries: the shapes are rasterised here with 8 x 8 supersampling for
// smooth edges and encoded as PNG with zlib. Run with `npm run icons`; the
// output is committed. If LogoMark changes, update LOGO below to match.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SIZES = [16, 32, 48, 128];
const SAMPLES = 8;

// LogoMark in its own 32 x 32 viewBox
const VIEWBOX = 32;
const LOGO = {
  background: { x: 0, y: 0, width: 32, height: 32, radius: 9 },
  // linearGradient x1=0 y1=0 x2=1 y2=1: colour runs along x + y
  gradient: [
    [124, 92, 255],
    [255, 107, 157],
  ],
  bars: [
    { x: 7, y: 8, width: 18, height: 4, radius: 2, opacity: 1 },
    { x: 7, y: 14, width: 13, height: 4, radius: 2, opacity: 0.85 },
    { x: 7, y: 20, width: 8, height: 4, radius: 2, opacity: 0.7 },
  ],
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const insideRoundedRect = (x, y, rect) => {
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const dx = Math.max(Math.abs(x - (rect.x + halfWidth)) - (halfWidth - rect.radius), 0);
  const dy = Math.max(Math.abs(y - (rect.y + halfHeight)) - (halfHeight - rect.radius), 0);
  return dx * dx + dy * dy <= rect.radius * rect.radius;
};

const mix = (from, to, t) => from.map((value, index) => value + (to[index] - value) * t);

// Colour and alpha of the logo at a point in viewBox units
const sample = (x, y) => {
  if (!insideRoundedRect(x, y, LOGO.background)) {
    return [0, 0, 0, 0];
  }
  const t = Math.min(Math.max((x + y) / (2 * VIEWBOX), 0), 1);
  let colour = mix(LOGO.gradient[0], LOGO.gradient[1], t);
  for (const bar of LOGO.bars) {
    if (insideRoundedRect(x, y, bar)) {
      colour = mix(colour, [255, 255, 255], bar.opacity);
    }
  }
  return [...colour, 1];
};

const drawIcon = (size) => {
  const scale = VIEWBOX / size;
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      // Average premultiplied samples, then divide the alpha back out
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const [r, g, b, a] = sample(
            (x + (sx + 0.5) / SAMPLES) * scale,
            (y + (sy + 0.5) / SAMPLES) * scale,
          );
          red += r * a;
          green += g * a;
          blue += b * a;
          alpha += a;
        }
      }
      if (alpha > 0) {
        row.set(
          [
            Math.round(red / alpha),
            Math.round(green / alpha),
            Math.round(blue / alpha),
            Math.round((alpha / (SAMPLES * SAMPLES)) * 255),
          ],
          1 + x * 4,
        );
      }
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const outDir = fileURLToPath(new URL("../src/icons/", import.meta.url));
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  writeFileSync(`${outDir}icon-${size}.png`, drawIcon(size));
}
console.log(`Wrote ${SIZES.length} icons to src/icons`);
