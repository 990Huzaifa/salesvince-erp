export type PrintThemeColors = {
  primary: string;
  primaryForeground: string;
  rowA: string;
  rowB: string;
  watermark: string;
};

const FALLBACK_PRIMARY = '#2d5f3e';
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
    rowA: toRgba(safePrimary, 0.08) || 'rgba(45, 95, 62, 0.08)',
    rowB: toRgba(safePrimary, 0.04) || 'rgba(45, 95, 62, 0.04)',
    watermark: toRgba(safePrimary, 0.11) || 'rgba(45, 95, 62, 0.11)',
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
