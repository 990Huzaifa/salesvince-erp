export type PrintThemeColors = {
  primary: string;
  primaryForeground: string;
  rowA: string;
  rowB: string;
  watermark: string;
};

const FALLBACK_PRIMARY = '#2563eb';
const FALLBACK_FG = '#ffffff';

function parseHex(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toRgba(color: string, alpha: number): string | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function resolvePrintThemeColors(
  theme?: {
    primaryColor?: string | null;
    primary_color?: string | null;
    primary?: string | null;
  } | null,
): PrintThemeColors {
  const primary =
    theme?.primaryColor?.trim() ||
    theme?.primary_color?.trim() ||
    theme?.primary?.trim() ||
    FALLBACK_PRIMARY;

  const parsed = parseHex(primary);
  const safePrimary = parsed
    ? `#${[parsed.r, parsed.g, parsed.b]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')}`
    : FALLBACK_PRIMARY;

  return {
    primary: safePrimary,
    primaryForeground: FALLBACK_FG,
    rowA: toRgba(safePrimary, 0.08) || 'rgba(37, 99, 235, 0.08)',
    rowB: toRgba(safePrimary, 0.04) || 'rgba(37, 99, 235, 0.04)',
    watermark: toRgba(safePrimary, 0.11) || 'rgba(37, 99, 235, 0.11)',
  };
}

/** CSS custom properties for invoice / report PDF templates. */
export function printThemeCssVars(colors: PrintThemeColors): string {
  return [
    `--primary:${colors.primary}`,
    `--primary-text:${colors.primaryForeground}`,
    `--row-a:${colors.rowA}`,
    `--row-b:${colors.rowB}`,
  ].join(';');
}

/** Classic / baked document-template brand blues (hardcoded hex in DB HTML). */
const DOCUMENT_TEMPLATE_BRAND_HEX = ['#2563eb', '#2f63e8'] as const;
const DOCUMENT_TEMPLATE_BRAND_RGB = [
  { r: 37, g: 99, b: 235 },
  { r: 47, g: 99, b: 232 },
] as const;

/**
 * Apply master-tenant primary color onto document-template HTML:
 * - rewrite baked brand hex / rgba blues
 * - sync CSS custom properties
 * - inject a late :root override so var(--primary) templates also update
 */
export function applyPrintThemeToHtml(
  html: string,
  colors: PrintThemeColors,
): string {
  const primaryRgb = parseHex(colors.primary) || parseHex(FALLBACK_PRIMARY)!;
  let themed = html;

  for (const hex of DOCUMENT_TEMPLATE_BRAND_HEX) {
    themed = themed.replace(new RegExp(hex, 'gi'), colors.primary);
  }

  for (const rgb of DOCUMENT_TEMPLATE_BRAND_RGB) {
    const rgbPattern = new RegExp(
      `rgba?\\(\\s*${rgb.r}\\s*,\\s*${rgb.g}\\s*,\\s*${rgb.b}\\s*(?:,\\s*([^)]+))?\\)`,
      'gi',
    );
    themed = themed.replace(rgbPattern, (_match, alpha?: string) =>
      alpha == null
        ? `rgb(${primaryRgb.r},${primaryRgb.g},${primaryRgb.b})`
        : `rgba(${primaryRgb.r},${primaryRgb.g},${primaryRgb.b},${String(alpha).trim()})`,
    );
  }

  themed = themed
    .replace(/--primary\s*:\s*[^;}]+/gi, `--primary:${colors.primary}`)
    .replace(
      /--primary-text\s*:\s*[^;}]+/gi,
      `--primary-text:${colors.primaryForeground}`,
    )
    .replace(/--row-a\s*:\s*[^;}]+/gi, `--row-a:${colors.rowA}`)
    .replace(/--row-b\s*:\s*[^;}]+/gi, `--row-b:${colors.rowB}`);

  const style = `<style id="print-theme-vars">:root{${printThemeCssVars(colors)}}</style>`;
  if (/<\/html\s*>/i.test(themed)) {
    return themed.replace(/<\/html\s*>/i, `${style}</html>`);
  }
  if (/<\/body\s*>/i.test(themed)) {
    return themed.replace(/<\/body\s*>/i, `${style}</body>`);
  }
  if (/<\/head\s*>/i.test(themed)) {
    return themed.replace(/<\/head\s*>/i, `${style}</head>`);
  }
  return `${themed}${style}`;
}
