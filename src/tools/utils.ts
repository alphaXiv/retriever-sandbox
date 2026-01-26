export function sanitizeText(text: string): string {
  return text
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
