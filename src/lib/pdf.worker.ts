import { createPdf } from './pdf';
import type { Trip } from '../types';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Trip>) => void) | null;
  postMessage: (value: { blob?: Blob; error?: string }) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    scope.postMessage({ blob: await createPdf(data) });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'PDF 排版失败。' });
  }
};
