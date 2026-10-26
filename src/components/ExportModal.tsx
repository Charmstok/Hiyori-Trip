import { useMemo, useRef, useState } from 'react';
import { Archive, Download, FileText, Image, LoaderCircle } from 'lucide-react';
import type { Trip } from '../types';
import { safeFilename } from '../lib/files';
import { saveFile, type SavedFile } from '../lib/db';
import { dateAt, dateLabel } from '../lib/trips';
import {
  exportImages,
  scopeFilename,
  sectionLabel,
  WHOLE_TRIP,
  type ExportScope,
  type ImageSection,
} from '../lib/export-scope';
import { ExportLongSection } from './ExportLongSection';
import { Modal } from './Modal';

const IMAGE_WIDTH = 794;
const A4_HEIGHT = 1123;
const PIXEL_RATIO = 1.5;

export function ExportModal({
  trip,
  onClose,
  onSaved,
}: {
  trip: Trip;
  onClose: () => void;
  onSaved: (file: SavedFile) => void;
}) {
  const [scope, setScope] = useState<ExportScope>(WHOLE_TRIP);
  const [dayIndex, setDayIndex] = useState(0);
  const sections = useMemo(() => exportImages(trip, scope), [trip, scope]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [render, setRender] = useState({
    section: sections[0],
    first: true,
    last: true,
    minHeight: A4_HEIGHT,
  });
  const stage = useRef<HTMLDivElement>(null);
  const filename = `${safeFilename(trip.title)}-${scopeFilename(scope)}`;

  function changeScope(kind: ExportScope['kind']) {
    setScope(kind === 'day' ? { kind, dayIndex } : { kind });
    setIndex(0);
    setError('');
  }
  async function persist(blob: Blob, name: string) {
    onSaved(await saveFile(blob, name));
  }
  async function fonts() {
    await document.fonts.load('16px Hiyori');
    await document.fonts.ready;
    const { getFontEmbedCSS } = await import('html-to-image');
    return getFontEmbedCSS(stage.current!, { preferredFontFormat: 'woff' });
  }
  async function capture(
    section: ImageSection,
    first: boolean,
    last: boolean,
    minHeight: number,
    fontCSS: string,
  ) {
    setRender({ section, first, last, minHeight });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const { toCanvas } = await import('html-to-image');
    return toCanvas(stage.current!, {
      pixelRatio: PIXEL_RATIO,
      backgroundColor: '#faf9f4',
      preferredFontFormat: 'woff',
      fontEmbedCSS: fontCSS,
    });
  }
  async function exportPng() {
    setError('');
    setBusy('正在准备长图…');
    try {
      const fontCSS = await fonts();
      const { LongImageWriter } = await import('../lib/long-image');
      const writer = new LongImageWriter(IMAGE_WIDTH * PIXEL_RATIO);
      for (const [i, section] of sections.entries()) {
        setBusy(`正在生成长图 ${i + 1} / ${sections.length}…`);
        const last = i === sections.length - 1;
        const minimum = last ? Math.max(0, A4_HEIGHT - writer.height / PIXEL_RATIO) : 0;
        const canvas = await capture(section, i === 0, last, minimum, fontCSS);
        if (canvas.width !== writer.width) throw new Error('图片宽度异常，请重试。');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('浏览器无法生成图片，请重试。');
        writer.append(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.height);
        canvas.width = canvas.height = 0;
      }
      await persist(writer.finish(Math.ceil(A4_HEIGHT * PIXEL_RATIO)), `${filename}-长图.png`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '长图导出失败，请重试。');
    } finally {
      setBusy('');
    }
  }
  async function exportZip() {
    setError('');
    setBusy('正在准备分段图片…');
    try {
      const fontCSS = await fonts();
      const files: Record<string, Uint8Array> = {};
      for (const [i, section] of sections.entries()) {
        setBusy(`正在生成 ${i + 1} / ${sections.length} 张图片…`);
        const canvas = await capture(section, true, true, A4_HEIGHT, fontCSS);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error('图片生成失败。'))),
            'image/png',
          ),
        );
        canvas.width = canvas.height = 0;
        const label =
          section.kind === 'trip-notes'
            ? '旅程随手记'
            : section.page.dayIndex < 0
              ? '待规划'
              : `Day-${String(section.page.dayIndex + 1).padStart(2, '0')}`;
        const part = section.kind === 'trip-notes' ? section.part : section.page.part;
        files[`${label}-${part}.png`] = new Uint8Array(await blob.arrayBuffer());
      }
      const { zipSync, strToU8 } = await import('fflate');
      files['READ-ME.txt'] = strToU8(
        `${trip.title}\n导出范围：${scopeFilename(scope)}\n图片按日期与段落排列，完整长图请在日和旅中选择“保存长图”。\n`,
      );
      await persist(
        new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], {
          type: 'application/zip',
        }),
        `${filename}-分段图片.zip`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片打包失败，请重试。');
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
          reject(new Error('PDF 生成超时，请按日期分别导出后重试。'));
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
        worker.postMessage({ trip, scope });
      });
      await persist(blob, `${filename}-行程.pdf`);
    } catch (e) {
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
            选择保存整趟行程，或只带上某一天。文件自动保存到当前用户的下载文件夹。
          </p>
          <label>
            导出范围
            <select
              disabled={!!busy}
              value={scope.kind}
              onChange={(e) => changeScope(e.target.value as ExportScope['kind'])}
            >
              <option value="trip">整趟行程</option>
              <option value="day">指定日期</option>
              {trip.unscheduled.length > 0 && <option value="unscheduled">待规划</option>}
            </select>
          </label>
          {scope.kind === 'day' && (
            <label>
              选择日期
              <select
                disabled={!!busy}
                value={dayIndex}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setDayIndex(value);
                  setScope({ kind: 'day', dayIndex: value });
                  setIndex(0);
                }}
              >
                {trip.days.map((day, i) => (
                  <option key={day.id} value={i}>
                    Day {i + 1} · {dateLabel(dateAt(trip.startDate, i))} · {day.title || '自由安排'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="export-option recommended"
            disabled={!!busy}
            onClick={() => void exportPng()}
          >
            <Image size={22} />
            <span>
              <strong>保存长图</strong>
              <small>PNG · 所选范围 · 最短 A4 高度</small>
            </span>
            <Download size={16} />
          </button>
          <button className="export-option" disabled={!!busy} onClick={() => void exportPdf()}>
            <FileText size={22} />
            <span>
              <strong>保存 PDF</strong>
              <small>A4 分页 · 带页码 · 可选择文字</small>
            </span>
            <Download size={16} />
          </button>
          <button className="export-option" disabled={!!busy} onClick={() => void exportZip()}>
            <Archive size={22} />
            <span>
              <strong>分段图片 ZIP</strong>
              <small>按段保存，方便逐张分享</small>
            </span>
            <Download size={16} />
          </button>
          <p className="export-footnote">
            长图包含所选范围的全部内容，不按 A4 截断；内容较少时保留一张 A4 的高度。PDF 继续使用 A4
            分页版式和页码。
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
            <span className="status-dot" /> LONG IMAGE PREVIEW{' '}
            <span>
              {index + 1} / {sections.length}
            </span>
          </div>
          <label className="export-preview-selector">
            <span className="sr-only">预览段落</span>
            <select
              value={index}
              disabled={!!busy}
              onChange={(e) => setIndex(Number(e.target.value))}
            >
              {sections.map((section, i) => (
                <option key={i} value={i}>
                  {sectionLabel(trip, section)}
                </option>
              ))}
            </select>
          </label>
          <p className="export-preview-hint">
            按段查看预览，保存长图时会合并全部 {sections.length} 段。
          </p>
          <div className="preview-sheet-wrapper">
            <ExportLongSection
              trip={trip}
              section={sections[index]}
              scope={scope}
              first
              last
              minHeight={660}
            />
          </div>
        </div>
      </div>
      <div className="export-render-stage" aria-hidden="true">
        <div ref={stage}>
          <ExportLongSection
            trip={trip}
            section={render.section}
            scope={scope}
            first={render.first}
            last={render.last}
            minHeight={render.minHeight}
          />
        </div>
      </div>
    </Modal>
  );
}
