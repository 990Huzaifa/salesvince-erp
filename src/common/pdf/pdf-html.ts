const printableValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) {
    return String(value);
  }
  return '';
};

export const escapeHtml = (value: unknown): string =>
  printableValue(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
