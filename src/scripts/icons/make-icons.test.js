const { test } = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const { encodePng, renderIcon } = require('./make-icons');

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BACKGROUND = [0x0f, 0x13, 0x1b, 255];
const LETTER = [0xe8, 0xb5, 0x4a, 255];

const pixelAt = (rgba, size, x, y) => Array.from(rgba.subarray((y * size + x) * 4, (y * size + x) * 4 + 4));

test('encodePng writes the PNG signature and the IHDR width and height', () => {
  const png = encodePng(64, 48, renderIcon(64).slice(0, 64 * 48 * 4));
  assert.deepStrictEqual(png.subarray(0, 8), SIGNATURE);
  assert.strictEqual(png.subarray(12, 16).toString(), 'IHDR');
  assert.strictEqual(png.readUInt32BE(16), 64);
  assert.strictEqual(png.readUInt32BE(20), 48);
  assert.strictEqual(png.subarray(png.length - 8, png.length - 4).toString(), 'IEND');
});

test('encodePng IDAT inflates back to the filtered scanlines', () => {
  const rgba = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const png = encodePng(2, 1, rgba);
  const idatLen = png.readUInt32BE(33);
  assert.strictEqual(png.subarray(37, 41).toString(), 'IDAT');
  const raw = zlib.inflateSync(png.subarray(41, 41 + idatLen));
  assert.deepStrictEqual(Array.from(raw), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('encodePng writes the correct CRC32 on IHDR', () => {
  const png = encodePng(1, 1, Buffer.from([0, 0, 0, 255]));
  assert.strictEqual(png.readUInt32BE(29), zlib.crc32(png.subarray(12, 29)));
});

test('renderIcon fills the corner with the background colour', () => {
  const size = 64;
  assert.deepStrictEqual(pixelAt(renderIcon(size), size, 0, 0), BACKGROUND);
});

test('renderIcon returns size*size*4 bytes containing letter pixels', () => {
  const size = 180;
  const rgba = renderIcon(size);
  assert.strictEqual(rgba.length, size * size * 4);
  let letters = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] === LETTER[0] && rgba[i + 1] === LETTER[1] && rgba[i + 2] === LETTER[2]) letters++;
  }
  assert.ok(letters > 0);
});
