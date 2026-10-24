import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

export async function downloadDirectory({
  platform = process.platform,
  home = homedir(),
  env = process.env,
  read = readFile,
} = {}) {
  const fallback = join(home, 'Downloads');
  if (platform !== 'linux') return fallback;
  function directory(value) {
    if (!value) return;
    const path = value.replace(/\$\{HOME\}|\$HOME(?=\/|$)/g, home).replace(/^~(?=\/|$)/, home);
    // Read paths as data; never source or evaluate a shell configuration file.
    if (path.includes('$') || !isAbsolute(path) || resolve(path) === resolve(home)) return;
    return resolve(path);
  }
  const exported = directory(env.XDG_DOWNLOAD_DIR);
  if (exported) return exported;
  const config =
    env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME)
      ? env.XDG_CONFIG_HOME
      : join(home, '.config');
  try {
    const text = await read(join(config, 'user-dirs.dirs'), 'utf8');
    const match = text.match(/^\s*XDG_DOWNLOAD_DIR="((?:\\.|[^"\\])*)"\s*(?:#.*)?$/m);
    const value = match?.[1].replace(/\\(["\\`$])/g, '$1');
    return directory(value) || fallback;
  } catch {
    return fallback;
  }
}
