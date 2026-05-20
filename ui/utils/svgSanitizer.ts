/**
 * Sanitizes input text for SVG text rendering, stripping any character
 * that is not alphanumeric, a space, or a hyphen.
 * This prevents XSS attacks and malformed SVG elements.
 */
export function sanitizeSvgText(text: string): string {
  if (!text) return "";
  return text.replace(/[^a-zA-Z0-9\-\s]/g, "");
}
