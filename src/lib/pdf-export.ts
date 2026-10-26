import type { Trip } from '../types';
import type { ExportScope } from './export-scope';

export type PdfRequest = { id: number } & (
  { type: 'prepare' } | { type: 'render'; trip: Trip; scope: ExportScope }
);
export type PdfReply = { id: number } & (
  | { type: 'progress'; message: string }
  | { type: 'ready' }
  | { type: 'result'; blob: Blob }
  | { type: 'error'; error: string }
);
type Pending = {
  resolve: (blob?: Blob) => void;
  reject: (error: Error) => void;
  onProgress?: (message: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};
let worker: Worker | undefined;
let prepared: Promise<void> | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

function dispose(error?: Error) {
  clearTimeout(idle);
  worker?.terminate();
  worker = undefined;
  prepared = undefined;
  for (const task of pending.values()) {
    clearTimeout(task.timeout);
    task.reject(error || new Error('PDF 排版已停止，请重试。'));
  }
  pending.clear();
}
function getWorker() {
  clearTimeout(idle);
  if (!worker) {
    worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<PdfReply>) => {
      const task = pending.get(data.id);
      if (!task) return;
      if (data.type === 'progress') {
        task.onProgress?.(data.message);
        return;
      }
      if (data.type === 'error') {
        dispose(new Error(data.error));
        return;
      }
      pending.delete(data.id);
      clearTimeout(task.timeout);
      task.resolve(data.type === 'result' ? data.blob : undefined);
      // Retain decoded fonts for repeat exports, then release their memory when idle.
      if (!pending.size) idle = setTimeout(() => dispose(), 5 * 60_000);
    };
    worker.onerror = () => dispose(new Error('本地 PDF 排版程序未能运行，请重试。'));
    worker.onmessageerror = () => dispose(new Error('无法读取 PDF 排版结果，请重试。'));
  }
  return worker;
}
function request(
  value: Omit<Extract<PdfRequest, { type: 'render' }>, 'id'> | { type: 'prepare' },
  onProgress?: (message: string) => void,
): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const current = getWorker();
    const id = ++nextId;
    const timeout = setTimeout(() => {
      dispose(new Error('PDF 排版暂未完成，请重试；较长的行程也可选择指定日期导出。'));
    }, 120_000);
    pending.set(id, { resolve, reject, onProgress, timeout });
    try {
      current.postMessage({ ...value, id });
    } catch {
      dispose(new Error('无法开始 PDF 排版，请重试。'));
    }
  });
}
export function warmPdf(): Promise<void> {
  prepared ??= request({ type: 'prepare' }).then(
    () => {},
    (error) => {
      prepared = undefined;
      throw error;
    },
  );
  return prepared;
}
export async function exportTripPdf(
  trip: Trip,
  scope: ExportScope,
  onProgress: (message: string) => void,
): Promise<Blob> {
  await warmPdf();
  const blob = await request({ type: 'render', trip, scope }, onProgress);
  if (!blob) throw new Error('PDF 生成失败，请重试。');
  return blob;
}
