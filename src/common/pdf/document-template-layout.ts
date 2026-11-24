export const DOCUMENT_LAYOUT_MARKER = '<!--document-template-layout-->';

export function getDocumentLayoutNamespace(content: string) {
  if (content.includes(DOCUMENT_LAYOUT_MARKER)) return 'document';
  // Older stored layouts declare their own namespace in the document marker.
  const namespace = content.match(/<!--([a-z][a-z0-9]*)-[a-z0-9-]+-document-->/)?.[1];
  return namespace && content.includes(`<!--${namespace}-verification-->`) &&
    content.includes(`<!--/${namespace}-verification-->`) ? namespace : null;
}
