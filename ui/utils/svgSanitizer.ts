/**
 * Sanitizes input text for SVG text rendering, stripping any character
 * that is not alphanumeric, a space, or a hyphen.
 * This prevents XSS attacks and malformed SVG elements.
 */
export function sanitizeSvgText(text: string): string {
  if (!text) return "";
  return text.replace(/[^a-zA-Z0-9\- ]/g, "");
}

/**
 * Sanitizes an untrusted SVG XML string, removing any <script> tags,
 * event handler attributes, and javascript: links to prevent XSS.
 */
export function sanitizeSvg(svgMarkup: string): string {
  if (!svgMarkup) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgMarkup, "image/svg+xml");

    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return "";
    }

    // 1. Remove all <script> elements
    const scripts = doc.getElementsByTagName("script");
    while (scripts.length > 0) {
      scripts[0].parentNode?.removeChild(scripts[0]);
    }

    // 2. Remove all event handlers (attributes starting with "on") and javascript: links
    const allElements = doc.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const attrName = attr.name.toLowerCase();
        const attrVal = attr.value.toLowerCase();
        const valClean = attrVal.trim().replace(/\s/g, "");
        if (
          attrName.startsWith("on") ||
          valClean.includes("javascript:") ||
          valClean.includes("data:") ||
          valClean.includes("vbscript:")
        ) {
          el.removeAttribute(attr.name);
        }
      }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (err) {
    console.error("SVG sanitization failed:", err);
    return "";
  }
}
