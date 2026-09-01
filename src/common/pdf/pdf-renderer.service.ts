import { Injectable, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { type Browser } from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { pdfConfig } from './pdf.config';
import { singlePageOverflow } from './pdf.errors';

export type RenderHtmlToPdfOptions = {
  html: string;
  contentSelector?: string;
  enforceSinglePage?: boolean;
  maximumHeightMm?: number;
};

@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private browserPromise?: Promise<Browser>;

  async onModuleDestroy(): Promise<void> {
    await this.closeBrowser();
  }

  async closeBrowser(): Promise<void> {
    if (!this.browserPromise) {
      return;
    }

    const activeBrowser = await this.browserPromise.catch(() => null);
    this.browserPromise = undefined;
    await activeBrowser?.close();
  }

  async renderHtmlToPdf(options: RenderHtmlToPdfOptions): Promise<Buffer> {
    const {
      html,
      contentSelector = '.pdf-content',
      enforceSinglePage = true,
      maximumHeightMm = 277,
    } = options;

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await page.emulateMediaType('print');

      if (enforceSinglePage) {
        const layout = await page.evaluate(
          (selector, maxHeightMm) => {
            const content = document.querySelector(selector);
            const probe = document.createElement('div');
            probe.style.cssText = `position:absolute;visibility:hidden;height:${maxHeightMm}mm;width:1px`;
            document.body.appendChild(probe);
            const result = {
              contentHeight: content?.getBoundingClientRect().height ?? Infinity,
              maximumHeight: probe.getBoundingClientRect().height,
            };
            probe.remove();
            return result;
          },
          contentSelector,
          maximumHeightMm,
        );

        if (layout.contentHeight > layout.maximumHeight + 1) {
          throw singlePageOverflow();
        }
      }

      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        tagged: true,
      });

      if (enforceSinglePage) {
        const pdfDocument = await PDFDocument.load(pdfBytes);
        if (pdfDocument.getPageCount() !== 1) {
          throw singlePageOverflow();
        }
      }

      return Buffer.from(pdfBytes);
    } finally {
      await page.close();
    }
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      const args = pdfConfig.puppeteerNoSandbox
        ? ['--no-sandbox', '--disable-setuid-sandbox']
        : [];

      this.browserPromise = puppeteer
        .launch({
          headless: true,
          executablePath: pdfConfig.puppeteerExecutablePath,
          args,
        })
        .catch((error) => {
          this.browserPromise = undefined;
          throw error;
        });
    }

    return this.browserPromise;
  }
}
