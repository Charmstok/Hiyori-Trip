import { unzlibSync } from 'fflate';

// Fontkit re-inflates WOFF's large glyf table for individual glyphs. Expand it once
// before layout; keep every table and glyph, without adding a second font asset.
export function unpackPdfFont(woff: ArrayBuffer): Uint8Array<ArrayBuffer> {
  const source = new DataView(woff);
  if (woff.byteLength < 44 || source.getUint32(0) !== 0x774f4646)
    throw new Error('本地 PDF 字体格式不正确。');
  const count = source.getUint16(12);
  const size = source.getUint32(16);
  if (
    count < 1 ||
    count > 64 ||
    44 + count * 20 > woff.byteLength ||
    size < 12 + count * 16 ||
    size > 32 * 1024 * 1024
  )
    throw new Error('本地 PDF 字体大小不正确。');
  const font = new Uint8Array(size);
  const target = new DataView(font.buffer);
  const selector = Math.floor(Math.log2(count));
  const searchRange = 16 * 2 ** selector;
  target.setUint32(0, source.getUint32(4));
  target.setUint16(4, count);
  target.setUint16(6, searchRange);
  target.setUint16(8, selector);
  target.setUint16(10, count * 16 - searchRange);
  let offset = 12 + count * 16;
  let head = -1;
  for (let i = 0; i < count; i++) {
    const entry = 44 + i * 20;
    const tag = source.getUint32(entry);
    const start = source.getUint32(entry + 4);
    const compressed = source.getUint32(entry + 8);
    const length = source.getUint32(entry + 12);
    const padded = Math.ceil(length / 4) * 4;
    if (compressed > length || start + compressed > woff.byteLength || offset + padded > size)
      throw new Error('本地 PDF 字体数据不完整。');
    const data = new Uint8Array(woff, start, compressed);
    const output = compressed < length ? unzlibSync(data, { out: new Uint8Array(length) }) : data;
    if (output.byteLength !== length) throw new Error('本地 PDF 字体数据不完整。');
    target.setUint32(12 + i * 16, tag);
    target.setUint32(16 + i * 16, source.getUint32(entry + 16));
    target.setUint32(20 + i * 16, offset);
    target.setUint32(24 + i * 16, length);
    font.set(output, offset);
    if (tag === 0x68656164 && length >= 12) head = offset;
    offset += padded;
  }
  if (offset !== size || head < 0) throw new Error('本地 PDF 字体数据不完整。');
  target.setUint32(head + 8, 0);
  let checksum = 0;
  for (let i = 0; i < size; i += 4) checksum = (checksum + target.getUint32(i)) >>> 0;
  target.setUint32(head + 8, (0xb1b0afba - checksum) >>> 0);
  return font;
}
