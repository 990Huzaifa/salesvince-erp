import type { Response } from 'express';

export type SendPdfOptions = {
  buffer: Buffer;
  filename: string;
};

export const sendPdf = (response: Response, options: SendPdfOptions): void => {
  const { buffer, filename } = options;

  response.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'no-store',
    'Content-Length': String(buffer.length),
  });
  response.send(buffer);
};
