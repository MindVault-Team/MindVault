## 2024-06-06 - XSS vulnerability in custom Markdown link renderer
**Vulnerability:** XSS in un-sanitized Markdown links.
**Learning:** `dangerouslySetInnerHTML` is not the only vector for XSS in React; using un-sanitized `href` attributes in custom component renders for libraries like `react-markdown` can also allow `javascript:` execution if users click them.
**Prevention:** Always validate and sanitize user-provided URLs when mapping them to anchor tags' `href` attributes, using an allowlist of safe protocols (like HTTP/HTTPS/mailto) or safe local URL patterns.
