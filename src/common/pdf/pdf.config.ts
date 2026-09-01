const splitCsv = (value?: string): string[] =>
  String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export const pdfConfig = {
  logoAllowedHosts: splitCsv(
    process.env.LOGO_ALLOWED_HOSTS ||
      'salesvince-erp.s3.ap-south-1.amazonaws.com',
  ),
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  puppeteerNoSandbox: process.env.PUPPETEER_NO_SANDBOX === 'true',
};
