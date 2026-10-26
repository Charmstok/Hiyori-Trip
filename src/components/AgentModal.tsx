import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  Image,
  Link,
  LoaderCircle,
  Paperclip,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Modal } from './Modal';
import { agentRequest, defaultConfig, generatePlan, readAgentFile } from '../lib/agent';
import { DEFAULT_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS, MIN_OUTPUT_TOKENS } from '../lib/agent-limits';
import type { AgentConfig, AgentDraft, AgentMaterial, AgentStatus } from '../lib/agent';
import { dateAt, dateLabel, inclusiveDays, today, totalActivities } from '../lib/trips';
import type { Trip } from '../types';

export function AgentModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (trip: Trip) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<AgentStatus>();
  const [config, setConfig] = useState<AgentConfig>(defaultConfig);
  const [settings, setSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(''),
    [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<AgentDraft | null>(null),
    [materials, setMaterials] = useState<AgentMaterial[]>([]),
    [preview, setPreview] = useState<string>();
  const [instruction, setInstruction] = useState(''),
    [url, setUrl] = useState(''),
    [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(today()),
    [endDate, setEndDate] = useState(dateAt(today(), 3));
  const [locate, setLocate] = useState(false),
    [refine, setRefine] = useState(false);
  const [progress, setProgress] = useState(''),
    [generating, setGenerating] = useState(false),
    [dayIndex, setDayIndex] = useState(0);
  const abort = useRef<AbortController | undefined>(undefined),
    alive = useRef(true),
    fileInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const disabled = !!busy || generating;
  const days = inclusiveDays(startDate, endDate);
  async function refresh() {
    const current = await agentRequest<AgentStatus>('status');
    if (!alive.current) return;
    setStatus(current);
    if (current.configured) {
      const [{ config: saved }, { draft: savedDraft }] = await Promise.all([
        agentRequest<{ config: AgentConfig }>('config'),
        agentRequest<{ draft: AgentDraft | null }>('draft'),
      ]);
      if (!alive.current) return;
      setConfig(saved);
      setDraft(savedDraft);
      if (savedDraft) {
        setStartDate(savedDraft.trip.startDate);
        setEndDate(dateAt(savedDraft.trip.startDate, savedDraft.trip.days.length - 1));
        setDestination(savedDraft.trip.destination || '');
      }
    } else {
      setDraft(null);
      setConfig(defaultConfig);
    }
  }
  useEffect(() => {
    alive.current = true;
    void refresh()
      .catch(() => {
        if (alive.current) setError('无法读取 Agent 配置。更新后请停止原进程，再运行 npm start。');
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);
  async function action(task: () => Promise<void>, label: string) {
    setError('');
    setNotice('');
    setBusy(label);
    try {
      await task();
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作未完成，请重试。');
    } finally {
      setBusy('');
    }
  }
  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      try {
        await agentRequest('config', { config: { ...config, apiKey } });
      } finally {
        setApiKey('');
      }
      await refresh();
      setSettings(false);
      setNotice('模型配置已加密保存。');
    }, '正在加密保存…');
  }
  async function addLink() {
    if (materials.length >= 5) {
      setError('一次最多添加 5 份材料。');
      return;
    }
    await action(async () => {
      const { material } = await agentRequest<{ material: AgentMaterial }>('link', {
        url: url.trim(),
      });
      setMaterials((items) => [...items, material]);
      setUrl('');
      setPreview(material.id);
    }, '正在读取网页…');
  }
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    if (files.length + materials.length > 5) {
      setError('一次最多添加 5 份材料。');
      return;
    }
    await action(async () => {
      for (const file of Array.from(files)) {
        const material = await readAgentFile(file);
        setMaterials((items) => [...items, material]);
      }
    }, '正在读取附件…');
    if (fileInput.current) fileInput.current.value = '';
  }
  async function plan(event: FormEvent) {
    event.preventDefault();
    if (abort.current || busy) return;
    setError('');
    setNotice('');
    setGenerating(true);
    setProgress('正在准备参考材料…');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await generatePlan(
        {
          instruction,
          destination,
          startDate,
          endDate,
          materials,
          locate,
          refine: refine && !!draft,
        },
        controller.signal,
        (message) => {
          if (alive.current) setProgress(message);
        },
      );
      if (alive.current) {
        setDraft(result);
        setDayIndex(0);
        setRefine(true);
        setNotice('草案已加密保存，可继续调整要求或保存为旅程。');
      }
    } catch (error) {
      if (alive.current)
        setError(
          controller.signal.aborted
            ? '已取消规划，之前的草案仍保留。'
            : error instanceof Error
              ? error.message
              : '规划未完成，请重试。',
        );
    } finally {
      if (alive.current) {
        setGenerating(false);
        setProgress('');
      }
      abort.current = undefined;
    }
  }
  async function saveTrip() {
    if (!draft || saving.current) return;
    saving.current = true;
    await action(async () => {
      if (!(await onSave(draft.trip))) throw new Error('未能写入旅程，请检查本地服务后重试。');
    }, '正在保存旅程…');
    saving.current = false;
  }
  const publicHost = (() => {
    try {
      return new URL(config.baseURL).host;
    } catch {
      return '配置的模型服务';
    }
  })();
  const currentDay = draft?.trip.days[Math.min(dayIndex, draft.trip.days.length - 1)];
  return (
    <Modal
      wide
      title="把灵感，排成旅程"
      eyebrow="HIYORI TRAVEL AGENT"
      onClose={() => {
        if (!busy) {
          abort.current?.abort();
          onClose();
        }
      }}
    >
      <div className="agent-toolbar">
        <p>
          <Sparkles size={16} /> 读懂你的想法，安排每一天。
        </p>
        {status?.configured && (
          <div>
            <button
              className="button small secondary"
              disabled={disabled}
              onClick={() => {
                setSettings(!settings);
                setError('');
                setNotice('');
              }}
            >
              <Settings2 size={14} />
              {settings ? '返回规划' : '模型设置'}
            </button>
          </div>
        )}
      </div>
      {loading ? (
        <p className="agent-loading">
          <LoaderCircle className="spin" size={18} /> 正在读取本地配置…
        </p>
      ) : !status?.configured || settings ? (
        <form className="form-stack agent-settings" onSubmit={saveConfig}>
          <div className="agent-security">
            <ShieldCheck size={21} />
            <p>API Key 自动加密保存在本机，保存后即可使用。</p>
          </div>
          {status?.needsReconfigure && (
            <p className="form-hint">加密方式已更新，请重新填写一次模型配置，以后无需解锁。</p>
          )}
          <div className="form-row">
            <label>
              Base URL
              <input
                required
                type="url"
                autoComplete="off"
                maxLength={1000}
                value={config.baseURL}
                onChange={(e) => setConfig({ ...config, baseURL: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              模型名称
              <input
                required
                maxLength={200}
                autoComplete="off"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder="输入服务商提供的 model 名称"
              />
            </label>
          </div>
          <label>
            API Key{' '}
            <span className="optional">
              {status?.configured ? '留空保留已保存的密钥' : '仅发送到你填写的模型地址'}
            </span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              required={!status?.configured}
              maxLength={4096}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.configured ? '已加密保存，无法回显' : '输入 API Key'}
            />
          </label>
          <details className="agent-advanced">
            <summary>兼容选项与高级配置</summary>
            <div className="form-row">
              <label>
                规划模式
                <select
                  value={config.mode}
                  onChange={(e) =>
                    setConfig({ ...config, mode: e.target.value as AgentConfig['mode'] })
                  }
                >
                  <option value="tools">工具调用 · 可查找关键地点</option>
                  <option value="json">JSON 兼容模式 · 无工具调用</option>
                </select>
              </label>
              <label>
                输出上限（tokens）
                <input
                  type="number"
                  min={MIN_OUTPUT_TOKENS}
                  max={MAX_OUTPUT_TOKENS}
                  step={1}
                  aria-describedby="agent-token-limit-help"
                  value={config.maxTokens}
                  onChange={(e) => setConfig({ ...config, maxTokens: Number(e.target.value) })}
                />
              </label>
              <label>
                输出参数
                <select
                  value={config.tokenParameter}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tokenParameter: e.target.value as AgentConfig['tokenParameter'],
                    })
                  }
                >
                  <option value="max_completion_tokens">max_completion_tokens</option>
                  <option value="max_tokens">max_tokens（部分兼容服务）</option>
                </select>
              </label>
              <label>
                Organization <span className="optional">可选</span>
                <input
                  autoComplete="off"
                  maxLength={200}
                  value={config.organization}
                  onChange={(e) => setConfig({ ...config, organization: e.target.value })}
                />
              </label>
              <label>
                Project <span className="optional">可选</span>
                <input
                  autoComplete="off"
                  maxLength={200}
                  value={config.project}
                  onChange={(e) => setConfig({ ...config, project: e.target.value })}
                />
              </label>
            </div>
            <p className="form-hint" id="agent-token-limit-help">
              默认 {DEFAULT_OUTPUT_TOKENS.toLocaleString('zh-CN')}，最多可设置{' '}
              {MAX_OUTPUT_TOKENS.toLocaleString('zh-CN')} tokens。实际可用上限以模型服务为准，推理
              token 也可能占用输出额度。
            </p>
          </details>
          <p className="form-hint">
            使用 OpenAI 兼容的 Chat Completions
            接口。上传图片时，请选择支持视觉输入的模型。本机模型的 HTTP 地址仅允许 localhost /
            127.0.0.1。
          </p>
          <div className="modal-actions">
            {status?.configured && (
              <button
                type="button"
                className="button secondary"
                disabled={disabled}
                onClick={() => setSettings(false)}
              >
                返回规划
              </button>
            )}
            <button className="button primary" disabled={disabled}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}{' '}
              加密保存配置
            </button>
          </div>
        </form>
      ) : (
        <div className="agent-layout">
          <form className="agent-input form-stack" onSubmit={plan}>
            <div className="agent-provider">
              <span className="status-dot" />
              <span>
                {config.model}
                <small>{publicHost}</small>
              </span>
              <button
                type="button"
                className="button text"
                disabled={disabled}
                onClick={() =>
                  void action(async () => {
                    await agentRequest('test', {});
                    setNotice('连接成功，模型可以正常响应。');
                  }, '正在测试连接…')
                }
              >
                测试连接
              </button>
            </div>
            <label>
              你想怎样旅行？
              <textarea
                rows={5}
                maxLength={12000}
                disabled={disabled}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="例如：京都和大阪四天，两个人，不想太赶。想去清水寺、岚山和海游馆，帮我把交通、用餐与停留时间排好。"
              />
            </label>
            <label>
              目的地 <span className="optional">可选</span>
              <input
                maxLength={100}
                disabled={disabled}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="京都、大阪、奈良…"
              />
            </label>
            <div className="form-row">
              <label>
                出发日期
                <input
                  required
                  type="date"
                  min="1900-01-01"
                  max="2200-12-31"
                  disabled={disabled}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (e.target.value > endDate) setEndDate(e.target.value);
                  }}
                />
              </label>
              <label>
                返回日期
                <input
                  required
                  type="date"
                  min={startDate}
                  max={startDate ? dateAt(startDate, 29) : '2200-12-31'}
                  disabled={disabled}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>
            <p className="form-hint">
              {Number.isFinite(days) && days > 0
                ? `共 ${days} 天，一次最多规划 30 天。`
                : '请选择旅行日期。'}
            </p>
            <div className="agent-source-entry">
              <label>
                参考链接
                <input
                  type="url"
                  maxLength={2500}
                  disabled={disabled || materials.length >= 5}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (url.trim() && !disabled && materials.length < 5) void addLink();
                    }
                  }}
                  placeholder="粘贴小红书或其他公开攻略链接"
                />
              </label>
              <button
                type="button"
                className="button secondary"
                disabled={disabled || !url.trim() || materials.length >= 5}
                onClick={() => void addLink()}
              >
                <Link size={15} />
                读取
              </button>
            </div>
            <p className="form-hint">
              仅提取公开正文。需要登录或无法读取时，请粘贴文字或上传截图。
            </p>
            <input
              className="sr-only"
              ref={fileInput}
              type="file"
              multiple
              accept=".xlsx,.csv,.tsv,.txt,.md,.png,.jpg,.jpeg,.webp"
              disabled={disabled}
              onChange={(e) => void addFiles(e.target.files)}
              aria-label="上传参考材料"
            />
            <button
              type="button"
              className="agent-upload"
              disabled={disabled || materials.length >= 5}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={20} />
              <span>
                添加表格、文字或图片
                <small>XLSX / CSV / TXT / Markdown / 图片 · 单份 8 MB，最多 5 份</small>
              </span>
            </button>
            {materials.length > 0 && (
              <ul className="agent-materials">
                {materials.map((material) => (
                  <li key={material.id}>
                    <button
                      type="button"
                      className="agent-material-title"
                      disabled={disabled}
                      onClick={() => setPreview(preview === material.id ? undefined : material.id)}
                    >
                      {material.kind === 'image' ? (
                        <Image size={16} />
                      ) : material.kind === 'link' ? (
                        <Link size={16} />
                      ) : (
                        <FileSpreadsheet size={16} />
                      )}
                      <span>{material.name}</span>
                      {material.truncated && <small>已截取</small>}
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={disabled}
                      aria-label={`移除${material.name}`}
                      onClick={() =>
                        setMaterials((items) => items.filter((m) => m.id !== material.id))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                    {preview === material.id && (
                      <div className="agent-material-preview">
                        {material.kind === 'image' ? (
                          <img src={material.image} alt={material.name} />
                        ) : (
                          <pre>{material.text}</pre>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {config.mode === 'tools' && (
              <label className="agent-check">
                <input
                  type="checkbox"
                  checked={locate}
                  disabled={disabled}
                  onChange={(e) => setLocate(e.target.checked)}
                />
                查找少量关键地点的准确位置
              </label>
            )}
            {config.mode === 'tools' && locate && (
              <p className="form-hint">
                地点检索会将地点关键词发送至 Photon；不会发送整份参考材料。
              </p>
            )}
            {draft && (
              <label className="agent-check">
                <input
                  type="checkbox"
                  checked={refine}
                  disabled={disabled}
                  onChange={(e) => setRefine(e.target.checked)}
                />
                在当前草案上继续调整
              </label>
            )}
            <p className="agent-disclosure">
              点击生成会将本次文字、已添加的材料{refine && draft ? '及当前草案' : ''}发送至{' '}
              <strong>{publicHost}</strong>，可能产生 API
              费用。原始材料仅在本次窗口中使用，草案自动加密保存。
            </p>
            {generating ? (
              <button
                key="cancel"
                type="button"
                className="button secondary"
                onClick={(event) => {
                  event.preventDefault();
                  abort.current?.abort();
                }}
              >
                取消规划
              </button>
            ) : (
              <button
                key="generate"
                type="submit"
                className="button primary"
                disabled={
                  disabled || (!instruction.trim() && !materials.length && !(draft && refine))
                }
              >
                <Sparkles size={17} />
                {draft && refine ? '调整这份草案' : '生成旅行草案'}
                <ArrowRight size={16} />
              </button>
            )}
          </form>
          <section className="agent-preview" aria-label="旅行草案预览">
            {generating && (
              <div className="agent-progress" role="status">
                <LoaderCircle className="spin" size={18} />
                <span>{progress}</span>
              </div>
            )}
            {!draft ? (
              <div className="agent-empty">
                <span>
                  <Sparkles size={34} strokeWidth={1} />
                </span>
                <p className="eyebrow">FROM INSPIRATION TO ITINERARY</p>
                <h3>
                  零散的灵感，
                  <br />
                  也能成为好旅程。
                </h3>
                <p>
                  粘贴攻略，放入表格或旅行截图。
                  <br />
                  Agent 会梳理地点、安排日期，
                  <br />
                  把需要确认的地方一起告诉你。
                </p>
                <ol>
                  <li>读懂材料</li>
                  <li>整理路线</li>
                  <li>预览与调整</li>
                </ol>
              </div>
            ) : (
              <>
                <div className="agent-draft-heading">
                  <span className="eyebrow">YOUR TRAVEL DRAFT</span>
                  <h3>{draft.trip.title}</h3>
                  <p>{draft.summary}</p>
                  <small>
                    {draft.trip.days.length} 天 · {totalActivities(draft.trip)} 段安排 · 已加密保存
                  </small>
                </div>
                <label className="agent-day-select">
                  查看日期
                  <select
                    value={Math.min(dayIndex, draft.trip.days.length - 1)}
                    onChange={(e) => setDayIndex(Number(e.target.value))}
                  >
                    {draft.trip.days.map((day, i) => (
                      <option key={day.id} value={i}>
                        Day {i + 1} · {dateLabel(dateAt(draft.trip.startDate, i))} · {day.title}
                      </option>
                    ))}
                  </select>
                </label>
                {currentDay && (
                  <div className="agent-draft-day">
                    <h4>{currentDay.title}</h4>
                    {currentDay.activities.map((a) => (
                      <article key={a.id}>
                        <time>{a.time || '自由安排'}</time>
                        <div>
                          <h5>{a.title}</h5>
                          <small>
                            {[
                              a.city,
                              a.duration,
                              a.cost ? `¥ ${a.cost.toLocaleString()}` : '',
                              a.coordinates ? '已定位' : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                          {a.address && <p className="agent-address">{a.address}</p>}
                          {a.notes && <p>{a.notes}</p>}
                        </div>
                      </article>
                    ))}
                    {currentDay.notes && <p className="agent-day-note">{currentDay.notes}</p>}
                  </div>
                )}
                {draft.trip.unscheduled.length > 0 && (
                  <details className="agent-notes">
                    <summary>待规划 · {draft.trip.unscheduled.length} 个地点</summary>
                    {draft.trip.unscheduled.map((a) => (
                      <p key={a.id}>
                        {a.title} · {a.city}
                        <br />
                        {a.notes}
                      </p>
                    ))}
                  </details>
                )}
                {draft.trip.notes && (
                  <details className="agent-notes">
                    <summary>旅程随手记</summary>
                    <p>{draft.trip.notes}</p>
                  </details>
                )}
                <details className="agent-notes">
                  <summary>规划假设与需要确认的事</summary>
                  <ul>
                    {[...draft.assumptions, ...draft.warnings].map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </details>
                {draft.sources.length > 0 && (
                  <details className="agent-notes">
                    <summary>参考材料 · {draft.sources.length} 份</summary>
                    <ul>
                      {draft.sources.map((s, i) => (
                        <li key={i}>{s.name}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="agent-save">
                  <p>保存后可在行程编辑器中调整每天的安排，并导出图片或 PDF。</p>
                  <button
                    type="button"
                    className="button primary"
                    disabled={disabled}
                    onClick={() => void saveTrip()}
                  >
                    <Check size={17} />
                    保存为旅程
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {busy && (
        <p className="agent-loading" role="status">
          <LoaderCircle className="spin" size={16} />
          {busy}
        </p>
      )}
      {notice && (
        <p className="agent-notice" role="status">
          <Check size={15} />
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error agent-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
