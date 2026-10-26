import { createPdf } from './pdf';
import type { Trip } from '../types';
import type { ExportScope } from './export-scope';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ trip: Trip; scope: ExportScope }>) => void) | null;
  postMessage: (value: { blob?: Blob; error?: string }) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    scope.postMessage({ blob: await createPdf(data.trip, data.scope) });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'PDF 排版失败。' });
  }
};
