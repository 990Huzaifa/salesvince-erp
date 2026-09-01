import { HttpException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'fs';
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { pdfConfig } from './pdf.config';
import { browserLaunchFailed, pdfRenderFailed, singlePageOverflow } from './pdf.errors';

export type RenderHtmlToPdfOptions = {
  html: string;
  contentSelector?: string;
  enforceSinglePage?: boolean;
  maximumHeightMm?: number;
};

const SYSTEM_CHROME_PATHS = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
];

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

    let browser: Browser;
    try {
      browser = await this.getBrowser();
    } catch (error) {
      this.rethrowPdfError(error, browserLaunchFailed);
    }

    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
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
    } catch (error) {
      this.rethrowPdfError(error, pdfRenderFailed);
    } finally {
      await page.close();
    }
  }

  private rethrowPdfError(
    error: unknown,
    fallback: (detail?: string) => HttpException,
  ): never {
    if (error instanceof HttpException) {
      throw error;
    }

    const detail = error instanceof Error ? error.message : String(error);
    throw fallback(detail);
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launchBrowser().catch((error) => {
        this.browserPromise = undefined;
        throw error;
      });
    }

    return this.browserPromise;
  }

  private async launchBrowser(): Promise<Browser> {
    const executablePath = await this.resolveLaunchExecutablePath();

    return puppeteer.launch({
      ...this.buildLaunchOptions(),
      executablePath,
    });
  }

  private buildLaunchOptions(): LaunchOptions {
    const args = [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ];

    if (pdfConfig.puppeteerNoSandbox) {
      args.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    return {
      headless: true,
      args,
      timeout: 60_000,
    };
  }

  private resolveExecutablePath(): string | undefined {
    if (pdfConfig.puppeteerExecutablePath) {
      return pdfConfig.puppeteerExecutablePath;
    }

    return SYSTEM_CHROME_PATHS.find((candidate) => existsSync(candidate));
  }

  private async resolveLaunchExecutablePath(): Promise<string | undefined> {
    const configuredPath = this.resolveExecutablePath();
    if (configuredPath) {
      return configuredPath;
    }

    try {
      const bundledPath = await puppeteer.executablePath();
      if (bundledPath && existsSync(bundledPath)) {
        return bundledPath;
      }
    } catch {
      // Bundled Chrome unavailable; launch will fail with a clearer error.
    }

    return undefined;
  }
}
