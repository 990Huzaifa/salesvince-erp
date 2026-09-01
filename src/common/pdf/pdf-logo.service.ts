import { Injectable } from '@nestjs/common';
import { pdfConfig } from './pdf.config';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

@Injectable()
export class PdfLogoService {
  async fetchLogoDataUri(
    logoUrl?: string | null,
    allowedHosts: string[] = pdfConfig.logoAllowedHosts,
  ): Promise<string | null> {
    if (!logoUrl) {
      return null;
    }

    try {
      const parsedUrl = new URL(logoUrl);
      if (
        parsedUrl.protocol !== 'https:' ||
        !allowedHosts.includes(parsedUrl.hostname)
      ) {
        return null;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      let response: Response;
      try {
        response = await fetch(parsedUrl, {
          signal: controller.signal,
          redirect: 'error',
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return null;
      }

      const mimeType = String(response.headers.get('content-type') || '')
        .split(';')[0]
        .toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return null;
      }

      const advertisedSize = Number(response.headers.get('content-length') || 0);
      if (advertisedSize > MAX_LOGO_BYTES) {
        return null;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
        return null;
      }

      return `data:${mimeType};base64,${bytes.toString('base64')}`;
    } catch {
      return null;
    }
  }
}
