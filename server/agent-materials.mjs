import { randomUUID } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import readExcelFile from 'read-excel-file/node';
import { inflateRawSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { readPublicPage } from './agent-network.mjs';

const clean = (text) =>
  String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
export function extractPage(html, url) {
  const { document } = parseHTML(html);
  const title = clean(
    document.querySelector('meta[property="og:title"]')?.content || document.title,
  ).slice(0, 200);
  const description = clean(
    document.querySelector('meta[property="og:description"]')?.content ||
      document.querySelector('meta[name="description"]')?.content,
  );
  const structured = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const visit = (item, depth = 0) => {
        if (!item || depth > 6) return;
        if (Array.isArray(item)) return item.forEach((v) => visit(v, depth + 1));
        if (typeof item === 'object') {
          if (typeof item.articleBody === 'string') structured.push(item.articleBody);
          if (typeof item.description === 'string') structured.push(item.description);
          if (item['@graph']) visit(item['@graph'], depth + 1);
        }
      };
      visit(data);
    } catch {
      /* Treat malformed page metadata as untrusted data. */
    }
  }
  // Public Xiaohongshu pages may contain their note in inert initial-state JSON. Never execute JS.
  const state = html.match(/(?:window\.)?__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*<\/script/i)?.[1];
  if (state && state.length < 2 * 1024 * 1024) {
    try {
      const data = JSON.parse(state.replace(/:\s*undefined(?=\s*[,}])/g, ':null'));
      for (const value of Object.values(data?.note?.noteDetailMap || {})) {
        const note = value?.note;
        if (typeof note?.desc === 'string') structured.push(note.title || '', note.desc);
      }
    } catch {
      /* Login-only content is not guessed. */
    }
  }
  document
    .querySelectorAll('script,style,noscript,nav,footer,header,form,iframe')
    .forEach((node) => node.remove());
  let article = '';
  try {
    article = new Readability(document).parse()?.textContent || '';
  } catch {
    /* Metadata fallback below. */
  }
  const parts = [
    ...new Set([title, description, ...structured, clean(article)].map(clean).filter(Boolean)),
  ];
  const text = parts.join('\n\n');
  if (
    text.length < 70 ||
    (!structured.length &&
      article.length < 80 &&
      /登录|验证码|login|sign in|访问验证|安全验证/i.test(text))
  )
    throw new Error('没有读到可用的文章正文，页面可能需要登录。请粘贴正文或上传截图。');
  return {
    id: randomUUID(),
    kind: 'link',
    name: title || new URL(url).hostname,
    url,
    text: text.slice(0, 40_000),
    truncated: text.length > 40_000,
  };
}
export async function linkMaterial(url, signal) {
  const page = await readPublicPage(url, signal);
  return extractPage(page.html, page.url);
}

// Check central-directory sizes before a spreadsheet parser allocates decompressed XML.
export function checkWorkbook(bytes) {
  if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('表格内容不是有效的 XLSX 文件。');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('表格文件不完整。');
  const count = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16);
  if (count > 1000 || count === 0xffff) throw new Error('表格结构过大，请简化后重试。');
  let p = offset,
    total = 0;
  const safeFiles = Object.create(null);
  let worksheets = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || bytes.readUInt32LE(p) !== 0x02014b50)
      throw new Error('表格目录损坏。');
    const size = bytes.readUInt32LE(p + 24);
    total += size;
    if (size > 8 * 1024 * 1024 || total > 20 * 1024 * 1024 || bytes.readUInt16LE(p + 8) & 1)
      throw new Error('不支持加密或解压后过大的表格，请改为 CSV。');
    const nameLength = bytes.readUInt16LE(p + 28);
    const name = bytes.toString('utf8', p + 46, p + 46 + nameLength);
    const start = bytes.readUInt32LE(p + 42),
      compressedSize = bytes.readUInt32LE(p + 20);
    if (
      start + 30 > bytes.length ||
      bytes.readUInt32LE(start) !== 0x04034b50 ||
      /(?:^|\/)\.\.(?:\/|$)/.test(name) ||
      name.startsWith('/') ||
      name.includes('\\')
    )
      throw new Error('表格目录格式不正确。');
    const dataStart = start + 30 + bytes.readUInt16LE(start + 26) + bytes.readUInt16LE(start + 28);
    if (dataStart + compressedSize > offset) throw new Error('表格数据越界。');
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const method = bytes.readUInt16LE(p + 10);
    const data =
      method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) })
          : null;
    if (!data || data.length !== size) throw new Error('表格解压大小不正确。');
    if (/\.xml$/i.test(name)) {
      const xml = data.toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('不支持包含实体声明的表格。');
      if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
        if (++worksheets > 20 || (xml.match(/<(?:\w+:)?c\b/g) || []).length > 40_000)
          throw new Error('表格单元格过多，请只保留旅行计划部分。');
        for (const match of xml.matchAll(/<(?:\w+:)?(?:row|c)\b([^>]*)>/g)) {
          const reference = match[1].match(/\br\s*=\s*(["'])(.*?)\1/)?.[2];
          if (!reference) continue;
          const cell = reference.match(/^([A-Z]{0,3})([1-9]\d{0,3})$/);
          const column =
            cell?.[1].split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) || 0;
          if (!cell || Number(cell[2]) > 5000 || column > 100)
            throw new Error('表格范围过大，请保留前 5000 行、100 列内的旅行计划。');
        }
      }
    }
    if (!name.endsWith('/')) safeFiles[name] = new Uint8Array(data);
    p += 46 + bytes.readUInt16LE(p + 28) + bytes.readUInt16LE(p + 30) + bytes.readUInt16LE(p + 32);
  }
  // Repack already bounded data without compression so downstream parsing cannot inflate a zip bomb.
  return Buffer.from(zipSync(safeFiles, { level: 0 }));
}
export async function fileMaterial(value) {
  const name = typeof value?.name === 'string' ? value.name.slice(0, 200) : '';
  if (
    !name ||
    typeof value.data !== 'string' ||
    value.data.length > 12 * 1024 * 1024 ||
    value.data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)
  )
    throw new Error('附件格式或大小不正确。');
  const bytes = Buffer.from(value.data, 'base64');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('每个附件最多 8 MB。');
  const ext = name.split('.').at(-1).toLowerCase();
  let mime;
  if (ext === 'png' && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a')
    mime = 'image/png';
  if (['jpg', 'jpeg'].includes(ext) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    mime = 'image/jpeg';
  if (
    ext === 'webp' &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    mime = 'image/webp';
  if (mime)
    return {
      id: randomUUID(),
      kind: 'image',
      name,
      image: `data:${mime};base64,${bytes.toString('base64')}`,
      text: '图片将由支持视觉的模型读取。',
    };
  let text;
  if (ext === 'xlsx') {
    if (bytes.length < 22) throw new Error('表格文件不完整。');
    const sheets = await readExcelFile(checkWorkbook(bytes));
    text = sheets
      .map(
        ({ sheet, data }) =>
          `工作表：${sheet}\n${data.map((row) => row.map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? ''))).join('\t')).join('\n')}`,
      )
      .join('\n\n');
  } else if (['csv', 'tsv', 'txt', 'md'].includes(ext)) {
    if (bytes.length > 1024 * 1024) throw new Error('文字和 CSV 附件最多 1 MB。');
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('请将文件保存为 UTF-8 编码后上传。');
    }
  } else throw new Error('支持 XLSX、CSV、TSV、TXT、Markdown 和 PNG/JPEG/WebP 图片。');
  text = clean(text);
  if (!text) throw new Error('附件没有可读取的内容。');
  return {
    id: randomUUID(),
    kind: 'text',
    name,
    text: text.slice(0, 40_000),
    truncated: text.length > 40_000,
  };
}
