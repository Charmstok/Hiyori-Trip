import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 2) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0)
    );
  }
  // Accept global unicast only; reject mapped IPv4, loopback, local, multicast and transition ranges.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{0,3}:/i.test(address) &&
    !/^2001:(?:0:|db8:)/i.test(address) &&
    !/^2002:/i.test(address)
  );
}
export function sourceURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('请粘贴完整的 http 或 https 链接。');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    url.href.length > 2500
  )
    throw new Error('只支持普通网页链接，不能包含登录凭据或自定义端口。');
  url.hash = '';
  return url;
}
export async function readPublicPage(value, signal) {
  let url = sourceURL(value);
  const deadline = AbortSignal.any([
    signal || new AbortController().signal,
    AbortSignal.timeout(20_000),
  ]);
  for (let redirect = 0; redirect <= 5; redirect++) {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new Error('不能读取本机、局域网或保留地址的链接。');
    // Pin the validated DNS answer in the actual connection, including every redirect.
    const chosen = addresses.find((address) => address.family === 4) || addresses[0];
    const result = await new Promise((resolve, reject) => {
      const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        url,
        {
          signal: deadline,
          maxHeaderSize: 32 * 1024,
          lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family),
          autoSelectFamily: false,
          headers: {
            'User-Agent': 'Hiyori-Trip/1.0 (local travel planner)',
            Accept: 'text/html,text/plain,application/xhtml+xml',
            'Accept-Encoding': 'identity',
          },
        },
        (res) => {
          const chunks = [];
          let size = 0;
          if (res.statusCode >= 300 && res.statusCode < 400) {
            res.resume();
            resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.alloc(0) });
            return;
          }
          res.on('data', (chunk) => {
            size += chunk.length;
            if (size > 4 * 1024 * 1024) {
              res.destroy();
              reject(new Error('网页过大，请改为粘贴文字或上传截图。'));
            } else chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () =>
            resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }),
          );
        },
      );
      req.on('error', reject);
      req.end();
    });
    if (result.status >= 300 && result.status < 400 && result.headers.location) {
      url = sourceURL(new URL(result.headers.location, url).href);
      continue;
    }
    if (result.status < 200 || result.status >= 300)
      throw new Error('网页需要登录或暂时无法读取，请粘贴正文或上传截图。');
    const type = result.headers['content-type'] || '';
    if (!/(text\/(html|plain)|application\/xhtml\+xml)/i.test(type))
      throw new Error('这个链接不是可读取的网页，请上传截图或表格。');
    let bytes = result.bytes;
    const encoding = result.headers['content-encoding'];
    const opts = { maxOutputLength: 4 * 1024 * 1024 };
    if (encoding === 'gzip') bytes = gunzipSync(bytes, opts);
    else if (encoding === 'deflate') bytes = inflateSync(bytes, opts);
    else if (encoding === 'br') bytes = brotliDecompressSync(bytes, opts);
    const charset = type.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
    let html;
    try {
      html = new TextDecoder(charset).decode(bytes);
    } catch {
      html = bytes.toString('utf8');
    }
    return { html, url: url.href };
  }
  throw new Error('链接跳转次数过多，请使用文章的完整链接。');
}
