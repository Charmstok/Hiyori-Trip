import { Zlib } from 'fflate';

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  crcTable[n] = crc >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) bytes[4 + i] = type.charCodeAt(i);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}

// Compress sections as rows, avoiding a single browser canvas with an oversized height.
export class LongImageWriter {
  readonly width: number;
  height = 0;
  private closed = false;
  private size = 0;
  private readonly parts: Uint8Array<ArrayBuffer>[] = [];
  private readonly compressor: Zlib;

  constructor(width: number) {
    if (!Number.isSafeInteger(width) || width < 1 || width > 32768)
      throw new Error('图片宽度无效。');
    this.width = width;
    this.compressor = new Zlib({ level: 6 }, (data) => {
      if (!data.length) return;
      this.size += data.length;
      if (this.size > 240 * 1024 * 1024) throw new Error('图片文件过大，请按日期分别导出。');
      this.parts.push(chunk('IDAT', data));
    });
  }
  append(rgba: Uint8ClampedArray | Uint8Array, height: number) {
    if (
      this.closed ||
      !Number.isSafeInteger(height) ||
      height < 1 ||
      rgba.length !== this.width * height * 4
    )
      throw new Error('图片分段数据无效。');
    if (this.height + height > 0x7fffffff) throw new Error('图片过长，请按日期分别导出。');
    const stride = this.width * 4;
    const rows = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      const source = y * stride,
        target = y * (stride + 1);
      rows[target] = 1; // PNG Sub filter keeps repeated paper backgrounds compact.
      for (let x = 0; x < stride; x++)
        rows[target + x + 1] = (rgba[source + x] - (x >= 4 ? rgba[source + x - 4] : 0)) & 255;
    }
    this.compressor.push(rows, false);
    this.height += height;
  }
  finish(minHeight = 1): Blob {
    if (this.closed || !Number.isSafeInteger(minHeight) || minHeight < 1)
      throw new Error('图片已完成或高度无效。');
    if (this.height < minHeight) {
      const pixels = new Uint8Array(this.width * (minHeight - this.height) * 4);
      for (let i = 0; i < pixels.length; i += 4) pixels.set([250, 249, 244, 255], i);
      this.append(pixels, minHeight - this.height);
    }
    this.compressor.push(new Uint8Array(), true);
    this.closed = true;
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, this.width);
    view.setUint32(4, this.height);
    header[8] = 8;
    header[9] = 6;
    return new Blob(
      [signature, chunk('IHDR', header), ...this.parts, chunk('IEND', new Uint8Array())],
      { type: 'image/png' },
    );
  }
}
