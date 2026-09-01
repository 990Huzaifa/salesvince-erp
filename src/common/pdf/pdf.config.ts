const splitCsv = (value?: string): string[] =>
  String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseBooleanEnv = (
  value: string | undefined,
  defaultValue: boolean,
): boolean => {
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true';
};

export const pdfConfig = {
  logoAllowedHosts: splitCsv(
    process.env.LOGO_ALLOWED_HOSTS ||
      'salesvince-erp.s3.ap-south-1.amazonaws.com',
  ),
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  // Linux VPS/Docker usually needs no-sandbox unless explicitly disabled.
  puppeteerNoSandbox: parseBooleanEnv(
    process.env.PUPPETEER_NO_SANDBOX,
    process.platform === 'linux',
  ),
};
