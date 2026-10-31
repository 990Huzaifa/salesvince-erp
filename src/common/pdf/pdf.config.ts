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

const defaultLogoHost = process.env.AWS_S3_BUCKET && process.env.AWS_REGION
  ? `${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`
  : 'salesvince-erp.s3.ap-south-1.amazonaws.com';

export const pdfConfig = {
  logoAllowedHosts: splitCsv(
    process.env.LOGO_ALLOWED_HOSTS || defaultLogoHost,
  ),
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  // Linux VPS/Docker usually needs no-sandbox unless explicitly disabled.
  puppeteerNoSandbox: parseBooleanEnv(
    process.env.PUPPETEER_NO_SANDBOX,
    process.platform === 'linux',
  ),
};
