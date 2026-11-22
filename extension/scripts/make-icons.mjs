// Writes placeholder toolbar icons (a purple rounded square with a white "S")
// to src/icons. Plain Node, no image libraries: pixels are drawn by hand and
// encoded as PNG with zlib. Run with `npm run icons`; the output is committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SIZES = [16, 32, 48, 128];
const BACKGROUND = [109, 74, 255];
const FOREGROUND = [255, 255, 255];

// 5 x 7 bitmap of the letter S
const GLYPH = ["01111", "10000", "10000", "01110", "00001", "00001", "11110"];

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

const insideRoundedSquare = (x, y, size) => {
  const radius = size * 0.22;
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};

const insideGlyph = (x, y, size) => {
  const cell = Math.max(1, Math.floor((size * 0.62) / GLYPH.length));
  const width = cell * GLYPH[0].length;
  const height = cell * GLYPH.length;
  const left = Math.floor((size - width) / 2);
  const top = Math.floor((size - height) / 2);
  const col = Math.floor((x - left) / cell);
  const row = Math.floor((y - top) / cell);
  return GLYPH[row]?.[col] === "1" && x >= left && y >= top;
};

const drawIcon = (size) => {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const offset = 1 + x * 4;
      if (!insideRoundedSquare(px, py, size)) {
        continue;
      }
      const colour = insideGlyph(x, y, size) ? FOREGROUND : BACKGROUND;
      row.set([...colour, 255], offset);
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
