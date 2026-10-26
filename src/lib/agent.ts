import type { Trip } from '../types';
import { localRequest } from './db';
import { DEFAULT_OUTPUT_TOKENS } from './agent-limits';

export interface AgentStatus {
  configured: boolean;
  needsReconfigure: boolean;
  hasDraft: boolean;
  busy?: boolean;
}
export interface AgentConfig {
  baseURL: string;
  model: string;
  organization: string;
  project: string;
  maxTokens: number;
  tokenParameter: 'max_completion_tokens' | 'max_tokens';
  mode: 'tools' | 'json';
}
export interface AgentMaterial {
  id: string;
  kind: 'link' | 'image' | 'text';
  name: string;
  text: string;
  url?: string;
  image?: string;
  truncated?: boolean;
}
export interface AgentDraft {
  trip: Trip;
  summary: string;
  assumptions: string[];
  warnings: string[];
  sources: { name: string; kind: string; url?: string }[];
  generatedAt: string;
}
export const defaultConfig: AgentConfig = {
  baseURL: 'https://api.openai.com/v1',
  model: '',
  organization: '',
  project: '',
  maxTokens: DEFAULT_OUTPUT_TOKENS,
  tokenParameter: 'max_completion_tokens',
  mode: 'tools',
};
export const agentRequest = <T>(action: string, value?: unknown) =>
  localRequest<T>(
    `agent/${action}`,
    value === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        },
  );
export async function readAgentFile(file: File): Promise<AgentMaterial> {
  if (file.size > 8 * 1024 * 1024) throw new Error('每个附件最多 8 MB。');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('无法读取附件，请重试。'));
    reader.readAsDataURL(file);
  });
  return (await agentRequest<{ material: AgentMaterial }>('file', { name: file.name, data }))
    .material;
}
export async function generatePlan(
  value: unknown,
  signal: AbortSignal,
  onProgress: (message: string) => void,
): Promise<AgentDraft> {
  const response = await fetch('/api/agent/generate', {
    method: 'POST',
    headers: { 'X-Hiyori-Local': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    signal,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '无法开始规划，请先保存模型配置。');
  }
  if (!response.body) throw new Error('浏览器无法读取规划结果。');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    draft: AgentDraft | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'progress') onProgress(event.message);
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'draft') draft = event.draft;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 2 * 1024 * 1024) throw new Error('规划结果过大。');
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        consume(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!draft) throw new Error('连接中断，之前的草案仍保留。');
    return draft;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
