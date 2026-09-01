import { HttpException, HttpStatus } from '@nestjs/common';

export class PdfGenerationException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    code = 'PDF_GENERATION_FAILED',
  ) {
    super({ code, message }, status);
  }
}

export const singlePageOverflow = (
  message = 'Document content exceeds the single-page A4 limit.',
): PdfGenerationException =>
  new PdfGenerationException(message, HttpStatus.UNPROCESSABLE_ENTITY, 'SINGLE_PAGE_LIMIT_EXCEEDED');

export const pdfRenderFailed = (
  message = 'Failed to generate PDF document.',
): PdfGenerationException =>
  new PdfGenerationException(message, HttpStatus.SERVICE_UNAVAILABLE, 'PDF_RENDER_FAILED');

export const browserLaunchFailed = (
  detail?: string,
): PdfGenerationException =>
  new PdfGenerationException(
    detail
      ? `PDF renderer failed to start: ${detail}`
      : 'PDF renderer failed to start. Install Chromium dependencies on the server or set PUPPETEER_EXECUTABLE_PATH.',
    HttpStatus.SERVICE_UNAVAILABLE,
    'PDF_BROWSER_LAUNCH_FAILED',
  );
