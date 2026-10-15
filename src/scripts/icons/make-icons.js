const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const BACKGROUND = [0x0f, 0x13, 0x1b, 255]; // ground-deep
const LETTER = [0xe8, 0xb5, 0x4a, 255]; // gold-lit
const MARGIN_RATIO = 0.18;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const GLYPHS = {
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
};
const TEXT = 'OS';
const GLYPH_GAP = 1;
const ROWS = 7;
const COLS = TEXT.length * 5 + (TEXT.length - 1) * GLYPH_GAP;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // filter byte 0 per row
  for (let y = 0; y < height; y++) {
    Buffer.from(rgba).copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) Buffer.from(BACKGROUND).copy(rgba, i * 4);
  const usable = size * (1 - 2 * MARGIN_RATIO);
  const scale = Math.max(1, Math.floor(Math.min(usable / COLS, usable / ROWS)));
  const left = Math.floor((size - COLS * scale) / 2);
  const top = Math.floor((size - ROWS * scale) / 2);
  [...TEXT].forEach((letter, index) => {
    const originCol = index * (5 + GLYPH_GAP);
    GLYPHS[letter].forEach((row, r) => {
      [...row].forEach((cell, c) => {
        if (cell !== '#') return;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = left + (originCol + c) * scale + dx;
            const y = top + r * scale + dy;
            Buffer.from(LETTER).copy(rgba, (y * size + x) * 4);
          }
        }
      });
    });
  });
  return rgba;
}

const OUTPUTS = {
  'favicon.png': 64,
  'apple-touch-icon.png': 180,
  'icon-192.png': 192,
  'icon-512.png': 512,
};

if (require.main === module) {
  const outDir = path.join(__dirname, '..', '..', 'client', 'public');
  for (const [name, size] of Object.entries(OUTPUTS)) {
    fs.writeFileSync(path.join(outDir, name), encodePng(size, size, renderIcon(size)));
  }
}

module.exports = { encodePng, renderIcon };
