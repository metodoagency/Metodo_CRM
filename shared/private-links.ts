// Classification only. No remote content is fetched or parsed.
export function isPrivateSourceUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try { return ['drive.google.com', 'docs.google.com'].includes(new URL(value).hostname); } catch { return false; }
}
export function maskPrivateLinks(value: unknown, key = ''): unknown {
  if (typeof value === 'string' && (isPrivateSourceUrl(value) || key === 'documentLink' && value.length > 0)) return '***';
  if (Array.isArray(value)) return value.map(item => maskPrivateLinks(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, maskPrivateLinks(item, name)]));
  return value;
}
