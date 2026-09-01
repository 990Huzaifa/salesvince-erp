import { Module } from '@nestjs/common';
import { PdfRendererService } from './pdf-renderer.service';
import { PdfLogoService } from './pdf-logo.service';

@Module({
  providers: [PdfRendererService, PdfLogoService],
  exports: [PdfRendererService, PdfLogoService],
})
export class PdfModule {}
