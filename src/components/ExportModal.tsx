import { useMemo, useRef, useState } from 'react';
import { Archive, Download, FileText, Image, LoaderCircle } from 'lucide-react';
import type { Trip } from '../types';
import { safeFilename } from '../lib/files';
import { saveFile } from '../lib/db';
import type { SavedFile } from '../lib/db';
import { imagePages } from '../lib/image-pages';
import type { ImagePage } from '../lib/image-pages';
import { ExportSheet } from './ExportSheet';
import { Modal } from './Modal';

export function ExportModal({
  trip,
  onClose,
  onSaved,
}: {
  trip: Trip;
  onClose: () => void;
  onSaved: (file: SavedFile) => void;
}) {
  const pages = useMemo(() => imagePages(trip), [trip]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [renderPage, setRenderPage] = useState<ImagePage>(pages[0]);
  const stage = useRef<HTMLDivElement>(null);
  const filename = safeFilename(trip.title);
  async function persistExport(blob: Blob, name: string) {
    onSaved(await saveFile(blob, name));
  }
  async function png(page: ImagePage, fontCSS?: string) {
    setRenderPage(page);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await document.fonts.load('16px Hiyori');
    await document.fonts.ready;
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(stage.current!, {
      pixelRatio: 1.5,
      backgroundColor: '#faf9f4',
      preferredFontFormat: 'woff',
      fontEmbedCSS: fontCSS,
    });
    if (!blob) throw new Error('图片生成失败，请重试。');
    return blob;
  }
  async function exportPng(all = false) {
    setError('');
    setBusy('正在准备图片…');
    try {
      if (all) {
        const { getFontEmbedCSS } = await import('html-to-image');
        await document.fonts.load('16px Hiyori');
        const css = await getFontEmbedCSS(stage.current!, { preferredFontFormat: 'woff' });
        const files: Record<string, Uint8Array> = {};
        for (const [i, page] of pages.entries()) {
          setBusy(`正在生成 ${i + 1} / ${pages.length} 张图片…`);
          const blob = await png(page, css);
          files[
            `${page.dayIndex < 0 ? '待规划' : `Day-${String(page.dayIndex + 1).padStart(2, '0')}`}-${page.part}.png`
          ] = new Uint8Array(await blob.arrayBuffer());
        }
        const { zipSync, strToU8 } = await import('fflate');
        files['READ-ME.txt'] = strToU8(
          `${trip.title}\n日和旅 Hiyori Trip 本地导出\n图片按日期排列，待规划单独成图，长行程会拆分为多张。\n可编辑行程已自动保存在项目内的 SQLite 数据库中。\n`,
        );
        if (trip.notes) files['旅程随手记.txt'] = strToU8(trip.notes);
        await persistExport(
          new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], {
            type: 'application/zip',
          }),
          `${filename}-每日行程.zip`,
        );
      } else {
        await persistExport(
          await png(pages[index]),
          `${filename}-${pages[index].dayIndex < 0 ? '待规划' : `Day${pages[index].dayIndex + 1}`}-${pages[index].part}.png`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片导出失败，请重试。');
    } finally {
      setBusy('');
    }
  }
  async function exportPdf() {
    setError('');
    setBusy('正在排版 PDF，首次导出需要稍等…');
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        const worker = new Worker(new URL('../lib/pdf.worker.ts', import.meta.url), {
          type: 'module',
        });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('PDF 生成超时，请拆分行程后重试。'));
        }, 120_000);
        const finish = () => {
          clearTimeout(timeout);
          worker.terminate();
        };
        worker.onmessage = ({ data }: { data: { blob?: Blob; error?: string } }) => {
          finish();
          if (data.blob) resolve(data.blob);
          else reject(new Error(data.error || 'PDF 生成失败。'));
        };
        worker.onerror = () => {
          finish();
          reject(new Error('本地 PDF 排版程序未能运行。'));
        };
        worker.postMessage(trip);
      });
      await persistExport(blob, `${filename}-旅行手册.pdf`);
    } catch (e) {
      console.error('Local PDF export failed', e);
      setError(e instanceof Error ? e.message : 'PDF 保存失败，请检查本地服务后重试。');
    } finally {
      setBusy('');
    }
  }
  return (
    <Modal
      wide
      title="把旅程，装进口袋"
      eyebrow="TAKE YOUR MEMORIES WITH YOU"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="export-layout">
        <div className="export-controls">
          <p className="export-intro">
            发给同行的朋友，或留一份给路上的自己。文件自动保存到当前用户的下载文件夹。
          </p>
          <label>
            图片预览
            <select
              disabled={!!busy}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
            >
              {pages.map((p, i) => (
                <option key={i} value={i}>
                  {p.dayIndex < 0
                    ? '待规划 · 日期未定'
                    : `Day ${p.dayIndex + 1} · ${trip.days[p.dayIndex].title || '自由安排'}`}
                  {p.part > 1 ? `（续 ${p.part}）` : ''}
                </option>
              ))}
            </select>
          </label>
          <button className="export-option" disabled={!!busy} onClick={() => void exportPng()}>
            <Image size={22} />
            <span>
              <strong>这张图片</strong>
              <small>PNG · 适合分享</small>
            </span>
            <Download size={16} />
          </button>
          <button className="export-option" disabled={!!busy} onClick={() => void exportPng(true)}>
            <Archive size={22} />
            <span>
              <strong>全部日期图片</strong>
              <small>ZIP · 长行程自动分图</small>
            </span>
            <Download size={16} />
          </button>
          <button
            className="export-option recommended"
            disabled={!!busy}
            onClick={() => void exportPdf()}
          >
            <FileText size={22} />
            <span>
              <strong>整段旅行手册</strong>
              <small>PDF · A4 分页 · 可选择文字</small>
            </span>
            <Download size={16} />
          </button>
          <p className="export-footnote">
            图片预览展示单日卡片。PDF 使用独立的 A4 版式，包含封面、行程一览、待规划和全部备注。
          </p>
          {busy && (
            <p className="export-progress" role="status">
              <LoaderCircle size={16} className="spin" />
              {busy}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="export-preview">
          <div className="preview-label">
            <span className="status-dot" /> IMAGE PREVIEW
            <span>
              {index + 1} / {pages.length}
            </span>
          </div>
          <div className="preview-sheet-wrapper">
            <ExportSheet trip={trip} page={pages[index]} />
          </div>
        </div>
      </div>
      <div className="export-render-stage" aria-hidden="true">
        <div ref={stage}>
          <ExportSheet trip={trip} page={renderPage} />
        </div>
      </div>
    </Modal>
  );
}
