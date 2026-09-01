const asFiniteNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const toFiniteNumber = asFiniteNumber;

export const formatPakistaniNumber = (
  value: unknown,
  decimals = 2,
): string => {
  const fixed = asFiniteNumber(value).toFixed(decimals);
  const [signedInteger, fraction] = fixed.split('.');
  const negative = signedInteger.startsWith('-');
  const integer = negative ? signedInteger.slice(1) : signedInteger;

  let grouped = integer;
  if (integer.length > 3) {
    const lastThree = integer.slice(-3);
    const leading = integer.slice(0, -3);
    const groups: string[] = [];
    for (let end = leading.length; end > 0; end -= 2) {
      groups.unshift(leading.slice(Math.max(0, end - 2), end));
    }
    grouped = `${groups.join(',')},${lastThree}`;
  }

  return `${negative ? '-' : ''}${grouped}${decimals > 0 ? `.${fraction}` : ''}`;
};

export const formatDocumentDate = (value?: string | Date | null): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}/${day}/${date.getUTCFullYear()}`;
};

export const formatPrintedAt = (value: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(value));

export const parseBooleanQuery = (
  value: string | undefined,
  defaultValue = true,
): boolean | null => {
  if (value === undefined) {
    return defaultValue;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return null;
};

export const safePdfFilenamePart = (value?: string | null): string =>
  String(value || 'document').replace(/[^a-z0-9_-]/gi, '-');

export const formatMonthName = (month?: number | string | null): string => {
  const numericMonth = Number(month);
  if (!numericMonth || Number.isNaN(numericMonth)) {
    return '-';
  }
  return new Date(2000, numericMonth - 1, 1).toLocaleString('en-US', {
    month: 'long',
  });
};

export const formatLongDate = (value?: string | Date | null): string => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return formatDocumentDate(value);
};

export const prettifyValue = (value?: string | null): string => {
  if (!value) {
    return '-';
  }
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};
