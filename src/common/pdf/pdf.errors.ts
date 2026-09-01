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
