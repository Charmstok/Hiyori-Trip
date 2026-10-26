import { createPdf, preparePdf } from './pdf';
import type { PdfRequest, PdfReply } from './pdf-export';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PdfRequest>) => void) | null;
  postMessage: (value: PdfReply) => void;
};
let queue = Promise.resolve();
scope.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    const { id } = data;
    try {
      await preparePdf();
      if (data.type === 'prepare') {
        scope.postMessage({ id, type: 'ready' });
        return;
      }
      scope.postMessage({ id, type: 'progress', message: '正在排版 PDF…' });
      const blob = await createPdf(data.trip, data.scope);
      scope.postMessage({ id, type: 'result', blob });
    } catch (error) {
      scope.postMessage({
        id,
        type: 'error',
        error: error instanceof Error ? error.message : 'PDF 排版失败。',
      });
    }
  });
};
