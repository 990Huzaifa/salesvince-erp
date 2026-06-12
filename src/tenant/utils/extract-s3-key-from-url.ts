export function extractS3KeyFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) {
    return null;
  }

  try {
    const parsed = new URL(url.trim());
    const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return key.length ? key : null;
  } catch {
    return null;
  }
}
