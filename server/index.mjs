import { createServer } from 'node:http';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, extname, resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.mjs';
import { createPlaceSearch } from './places.mjs';
import { downloadDirectory } from './downloads.mjs';
import { createAgent } from './agent.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function startHiyoriServer({
  port = 4317,
  dataDirectory = join(root, '.local-data'),
  production = process.argv.includes('--preview'),
  placeSearch = createPlaceSearch(),
} = {}) {
  const database = openDatabase(dataDirectory);
  const exportDirectory = await downloadDirectory();
  const backupDirectory = join(root, 'exports');
  const searchPlaces = placeSearch;
  const agent = createAgent(dataDirectory, { searchPlaces });
  const extensions = { 'application/pdf': '.pdf', 'image/png': '.png', 'application/zip': '.zip' };
  function json(response, status, value) {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(value));
  }
  async function body(request, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > limit) throw new Error('文件过大，请按日期分别导出。');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function uniqueFile(name, write, directory = exportDirectory) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const safe =
      name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^[. ]+|[. ]+$/g, '') || 'hiyori';
    const extension = extname(safe);
    let stem = '';
    for (const character of safe.slice(0, safe.length - extension.length)) {
      if (Buffer.byteLength(stem + character, 'utf8') > 180) break;
      stem += character;
    }
    stem ||= 'hiyori';
    for (let i = 0; i < 10000; i++) {
      const filename = `${stem}${i ? ` (${i})` : ''}${extension}`;
      const path = join(directory, filename);
      let handle;
      try {
        handle = await open(path, 'wx', 0o600);
      } catch (error) {
        if (error.code === 'EEXIST') continue;
        throw error;
      }
      try {
        await write(handle, path);
        await handle.sync();
      } catch (error) {
        await handle.close();
        await unlink(path).catch(() => {});
        throw error;
      }
      await handle.close();
      return { path, name: filename };
    }
    throw new Error('同名文件过多，请更改旅程名称后重试。');
  }
  let vite;
  const server = createServer(async (request, response) => {
    const host = request.headers.host;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host))
      return json(response, 403, { error: '仅允许本机访问。' });
    let url;
    try {
      url = new URL(request.url, `http://${host}`);
      decodeURIComponent(url.pathname);
    } catch {
      return json(response, 400, { error: '无效的地址。' });
    }
    if (url.pathname.startsWith('/api/')) {
      const origin = request.headers.origin;
      if ((origin && origin !== `http://${host}`) || request.headers['x-hiyori-local'] !== '1')
        return json(response, 403, { error: '请从日和旅页面操作。' });
      try {
        if (url.pathname.startsWith('/api/agent/'))
          return await agent.handle(request, response, url.pathname, body, json);
        if (request.method === 'GET' && url.pathname === '/api/maps/search')
          return json(response, 200, await searchPlaces(url.searchParams));
        if (request.method === 'GET' && url.pathname === '/api/trips')
          return json(response, 200, { trips: database.all(), trash: database.trash() });
        if (request.method === 'PUT' && url.pathname === '/api/trips') {
          database.save(JSON.parse((await body(request, 80 * 1024 * 1024)).toString()));
          return json(response, 200, { saved: true });
        }
        if (request.method === 'DELETE' && url.pathname.startsWith('/api/trips/')) {
          const trip = database.remove(
            decodeURIComponent(url.pathname.slice('/api/trips/'.length)),
          );
          return json(response, 200, { trip });
        }
        const restoreMatch = url.pathname.match(/^\/api\/trips\/([^/]+)\/restore$/);
        if (request.method === 'POST' && restoreMatch)
          return json(response, 200, {
            trip: database.restore(decodeURIComponent(restoreMatch[1])),
          });
        const purgeMatch = url.pathname.match(/^\/api\/trash\/([^/]+)$/);
        if (request.method === 'DELETE' && purgeMatch) {
          database.purge(decodeURIComponent(purgeMatch[1]));
          return json(response, 200, { removed: true });
        }
        if (request.method === 'POST' && url.pathname === '/api/migrate') {
          const values = JSON.parse((await body(request, 80 * 1024 * 1024)).toString());
          return json(response, 200, { count: database.migrate(values) });
        }
        if (request.method === 'POST' && url.pathname === '/api/exports') {
          const extension = extensions[request.headers['content-type']];
          if (!extension) throw new Error('不支持的文件类型。');
          const name = url.searchParams.get('name') || `hiyori${extension}`;
          if (extname(name).toLowerCase() !== extension) throw new Error('文件扩展名不正确。');
          const contents = await body(request, 256 * 1024 * 1024);
          const signature = contents.subarray(0, 8).toString('hex');
          if (
            (extension === '.png' && signature !== '89504e470d0a1a0a') ||
            (extension === '.pdf' && !contents.subarray(0, 5).equals(Buffer.from('%PDF-'))) ||
            (extension === '.zip' && !signature.startsWith('504b0304'))
          )
            throw new Error('文件内容不完整，请重新导出。');
          return json(
            response,
            201,
            await uniqueFile(name, (handle) => handle.writeFile(contents)),
          );
        }
        if (request.method === 'POST' && url.pathname === '/api/backup') {
          const name = `日和旅-数据库-${new Date().toISOString().slice(0, 10)}.sqlite`;
          return json(
            response,
            201,
            await uniqueFile(name, (_handle, path) => database.backup(path), backupDirectory),
          );
        }
        return json(response, 404, { error: '没有这个本地操作。' });
      } catch (error) {
        console.error('本地操作失败：', error);
        return json(response, 400, {
          error:
            error.code === 'ENOSPC'
              ? '磁盘空间不足，请清理后重试。'
              : error.message || '本地操作失败，请重试。',
        });
      }
    }
    if (
      /(?:^|\/)(?:\.local-data|\.local-dev|\.git|exports|backups)(?:\/|$)/i.test(
        decodeURIComponent(url.pathname),
      )
    )
      return json(response, 404, { error: '文件不可通过网页访问。' });
    if (vite) return vite.middlewares(request, response);
    try {
      const directory = join(root, 'dist');
      const path =
        url.pathname === '/'
          ? join(directory, 'index.html')
          : resolve(directory, `.${decodeURIComponent(url.pathname)}`);
      if (!path.startsWith(directory + sep)) throw new Error('Invalid path');
      const mime = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.woff': 'font/woff',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.json': 'application/json',
      };
      const content = await readFile(path);
      response.writeHead(200, {
        'Content-Type': mime[extname(path)] || 'application/octet-stream',
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end('请先运行 npm run build，再运行 npm run preview。');
    }
  });
  if (!production) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      root,
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/.local-data/**', '**/.local-dev/**', '**/exports/**', '**/backups/**'],
        },
        hmr: { server },
        fs: {
          deny: [
            '.env',
            '.env.*',
            '**/.git/**',
            '**/.local-data/**',
            '**/.local-dev/**',
            '**/exports/**',
            '**/backups/**',
          ],
        },
      },
    });
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  }).catch(async (error) => {
    await vite?.close();
    agent.close();
    database.close();
    throw error;
  });
  console.log(
    `日和旅已启动：http://127.0.0.1:${port}/\n数据库：${database.file}\n导出目录：${exportDirectory}`,
  );
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    agent.close();
    await vite?.close();
    const finished = new Promise((resolve) => server.close(resolve));
    server.closeIdleConnections();
    await finished;
    database.close();
  }
  return { server, close };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startHiyoriServer()
    .then(({ close }) => {
      const stop = () => {
        void close().then(() => process.exit(0));
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    })
    .catch((error) => {
      console.error(
        error.code === 'EADDRINUSE'
          ? '4317 端口已被占用，请先停止另一个日和旅进程。'
          : '日和旅启动失败，请检查本地文件权限和运行环境。',
      );
      process.exitCode = 1;
    });
}
