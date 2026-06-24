import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const size = 512;
const pixels = Buffer.alloc(size * size * 4);

fill([241, 90, 42, 255]);
rect(32, 32, 448, 448, [21, 52, 62, 255]);
rect(52, 52, 408, 408, [241, 90, 42, 255]);

// C
rect(105, 125, 55, 262, [255, 253, 248, 255]);
rect(105, 125, 150, 55, [255, 253, 248, 255]);
rect(105, 332, 150, 55, [255, 253, 248, 255]);

// F
rect(285, 125, 55, 262, [255, 253, 248, 255]);
rect(285, 125, 135, 55, [255, 253, 248, 255]);
rect(285, 228, 115, 50, [255, 253, 248, 255]);

const scanlines = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  const rowStart = y * (size * 4 + 1);
  scanlines[rowStart] = 0;
  pixels.copy(scanlines, rowStart + 1, y * size * 4, (y + 1) * size * 4);
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", createHeader()),
  chunk("IDAT", deflateSync(scanlines)),
  chunk("IEND", Buffer.alloc(0)),
]);

const output = path.resolve("build", "icon.png");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, png);
console.log(output);

function fill(color) {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set(color, offset);
  }
}

function rect(x, y, width, height, color) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      pixels.set(color, (row * size + column) * 4);
    }
  }
}

function createHeader() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return header;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
