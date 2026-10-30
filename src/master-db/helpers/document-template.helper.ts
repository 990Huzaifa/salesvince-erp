type DocumentTemplatePackIdentity = {
  code?: unknown;
  name?: unknown;
  status?: unknown;
  isActive?: unknown;
};

type InlineDocumentTemplateItem = {
  documentType?: unknown;
  sourceType?: unknown;
  isActive?: unknown;
  content?: unknown;
};

export const shouldUseCustomDocumentTemplatePack = (
  pack: DocumentTemplatePackIdentity | null | undefined,
): boolean => {
  if (!pack) return false;
  if (pack.isActive === false) return false;

  const status = String(pack.status ?? '').trim().toUpperCase();
  if (status && status !== 'ACTIVE') return false;

  const code = String(pack.code ?? '').trim().toLowerCase();
  const name = String(pack.name ?? '').trim().toLowerCase();
  return code !== 'classic' && name !== 'classic';
};

export const findActiveInlineDocumentTemplateItem = <T extends InlineDocumentTemplateItem>(
  items: T[] | null | undefined,
  documentType: string,
): T | null => {
  const type = String(documentType ?? '').trim().toUpperCase();
  if (!type || !Array.isArray(items)) return null;

  return items.find((item) =>
    String(item.documentType ?? '').trim().toUpperCase() === type &&
    item.isActive !== false &&
    String(item.sourceType ?? 'INLINE').trim().toUpperCase() === 'INLINE' &&
    typeof item.content === 'string' &&
    item.content.trim().length > 0,
  ) ?? null;
};
