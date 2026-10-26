import { DatabaseSync } from 'node:sqlite';
import {
  mkdirSync,
  chmodSync,
  openSync,
  closeSync,
  fchmodSync,
  fstatSync,
  readFileSync,
  writeFileSync,
  fsyncSync,
  linkSync,
  unlinkSync,
  constants,
} from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import {
  DEFAULT_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  MIN_OUTPUT_TOKENS,
} from '../src/lib/agent-limits.ts';
export function normalizeConfig(value, previous = {}) {
  const str = (name, max, fallback = '') => {
    const text = value?.[name] ?? fallback;
    if (typeof text !== 'string' || text.length > max || /[\r\n\0]/.test(text))
      throw new Error('模型配置格式不正确。');
    return text.trim();
  };
  let url;
  try {
    url = new URL(str('baseURL', 1000, 'https://api.openai.com/v1'));
  } catch {
    throw new Error('请填写有效的 Base URL。');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Base URL 须使用 HTTPS；本机模型可使用 http://localhost 或 127.0.0.1。请勿填写查询参数或密码。',
    );
  const apiKey = str('apiKey', 4096) || previous.apiKey;
  const model = str('model', 200);
  if (!apiKey || !model) throw new Error('请填写 API Key 和模型名称。');
  const maxTokens = Number(value.maxTokens ?? DEFAULT_OUTPUT_TOKENS);
  if (
    !Number.isInteger(maxTokens) ||
    maxTokens < MIN_OUTPUT_TOKENS ||
    maxTokens > MAX_OUTPUT_TOKENS
  )
    throw new Error(
      `输出上限须为 ${MIN_OUTPUT_TOKENS.toLocaleString('zh-CN')}–${MAX_OUTPUT_TOKENS.toLocaleString('zh-CN')} tokens。`,
    );
  return {
    apiKey,
    model,
    baseURL: url.href.replace(/\/$/, ''),
    organization: str('organization', 200),
    project: str('project', 200),
    maxTokens,
    tokenParameter: value.tokenParameter === 'max_tokens' ? 'max_tokens' : 'max_completion_tokens',
    mode: value.mode === 'json' ? 'json' : 'tools',
  };
}

// Local installation key: generated automatically, separate from ciphertext, never sent to the browser.
export function openAgentVault(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const file = join(directory, 'agent.sqlite');
  const keyFile = join(directory, 'agent.key');
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  const schema =
    'CREATE TABLE vault (id INTEGER PRIMARY KEY CHECK(id=1), iv BLOB NOT NULL, tag BLOB NOT NULL, ciphertext BLOB NOT NULL)';
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;
    ${schema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS')};
    CREATE TABLE IF NOT EXISTS draft (id INTEGER PRIMARY KEY CHECK(id=1), iv BLOB NOT NULL, tag BLOB NOT NULL, ciphertext BLOB NOT NULL);`);
  let legacy = db
    .prepare('PRAGMA table_info(vault)')
    .all()
    .some((column) => column.name === 'salt');
  let key,
    closed = false;
  const row = () => db.prepare('SELECT * FROM vault WHERE id=1').get();
  function readKey() {
    const descriptor = openSync(keyFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = fstatSync(descriptor);
      if (!info.isFile() || info.size !== 32) throw new Error('本机加密密钥文件损坏，请重新配置。');
      fchmodSync(descriptor, 0o600);
      return readFileSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
  function getKey(create = false) {
    if (closed) throw new Error('Agent 本地服务已关闭。');
    if (key) return key;
    try {
      key = readKey();
    } catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      const temporary = join(directory, `.agent-key-${randomUUID()}.tmp`);
      const generated = randomBytes(32);
      let descriptor;
      try {
        descriptor = openSync(temporary, 'wx', 0o600);
        writeFileSync(descriptor, generated);
        fsyncSync(descriptor);
        closeSync(descriptor);
        descriptor = undefined;
        // Publish a fully written file without replacing a key another local process just created.
        try {
          linkSync(temporary, keyFile);
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
        key = readKey();
      } finally {
        generated.fill(0);
        if (descriptor !== undefined) closeSync(descriptor);
        try {
          unlinkSync(temporary);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
    }
    return key;
  }
  function encrypt(value, purpose) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', getKey(true), iv);
    cipher.setAAD(Buffer.from(`hiyori-agent-v2:${purpose}`));
    const plaintext = Buffer.from(JSON.stringify(value));
    try {
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return { iv, tag: cipher.getAuthTag(), ciphertext };
    } finally {
      plaintext.fill(0);
    }
  }
  function decrypt(value, purpose) {
    const decipher = createDecipheriv('aes-256-gcm', getKey(), value.iv);
    decipher.setAAD(Buffer.from(`hiyori-agent-v2:${purpose}`));
    decipher.setAuthTag(value.tag);
    const plaintext = Buffer.concat([decipher.update(value.ciphertext), decipher.final()]);
    try {
      return JSON.parse(plaintext.toString('utf8'));
    } finally {
      plaintext.fill(0);
    }
  }
  function currentConfig() {
    const saved = row();
    if (!saved || legacy) return null;
    try {
      return decrypt(saved, 'config');
    } catch {
      return null;
    }
  }
  // Upgrade only the former default once. Later explicit choices, including 8192, stay intact.
  if (!legacy && db.prepare('PRAGMA user_version').get().user_version < 3) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const saved = row();
      const config = saved ? currentConfig() : null;
      if (!saved || config) {
        if (config && (config.maxTokens == null || config.maxTokens === 8192)) {
          const encrypted = encrypt({ ...config, maxTokens: DEFAULT_OUTPUT_TOKENS }, 'config');
          db.prepare('UPDATE vault SET iv=?,tag=?,ciphertext=? WHERE id=1').run(
            encrypted.iv,
            encrypted.tag,
            encrypted.ciphertext,
          );
        }
        db.exec('PRAGMA user_version=3');
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    file,
    status() {
      const configured = !!currentConfig();
      return {
        configured,
        needsReconfigure: !!row() && !configured,
        hasDraft: configured && !!db.prepare('SELECT id FROM draft').get(),
      };
    },
    config() {
      const config = currentConfig();
      if (!config)
        throw new Error(
          row() ? '原有配置无法自动读取，请重新填写一次模型配置。' : '请先配置模型。',
        );
      return config;
    },
    publicConfig() {
      const { apiKey: _key, ...config } = this.config();
      return config;
    },
    save(value) {
      const previous = currentConfig();
      const config = normalizeConfig(value, previous || {});
      const encrypted = encrypt(config, 'config');
      db.exec('BEGIN IMMEDIATE');
      try {
        if (legacy) {
          db.exec(`DROP TABLE vault; ${schema};`);
        }
        // An old password-encrypted draft or one whose installation key was lost cannot be decoded.
        // Keep it untouched until the user explicitly saves a replacement configuration.
        if (!previous) db.exec('DELETE FROM draft');
        db.prepare('INSERT OR REPLACE INTO vault VALUES (1,?,?,?)').run(
          encrypted.iv,
          encrypted.tag,
          encrypted.ciphertext,
        );
        db.exec('PRAGMA user_version=3; COMMIT');
        legacy = false;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    draft() {
      this.config();
      const saved = db.prepare('SELECT * FROM draft').get();
      if (!saved) return null;
      try {
        return decrypt(saved, 'draft');
      } catch {
        throw new Error('上次草案无法读取，可以重新生成。');
      }
    },
    saveDraft(value) {
      this.config();
      const encrypted = encrypt(value, 'draft');
      db.prepare('INSERT OR REPLACE INTO draft VALUES (1,?,?,?)').run(
        encrypted.iv,
        encrypted.tag,
        encrypted.ciphertext,
      );
    },
    close() {
      if (closed) return;
      closed = true;
      key?.fill(0);
      key = undefined;
      db.close();
    },
  };
}
