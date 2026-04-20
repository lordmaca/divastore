import sanitizeHtml from "sanitize-html";

// DivaHub pushes plain text with newlines (no HTML), but admins may paste HTML
// in the product form. We detect and render safely:
//   - If it looks like HTML, sanitize to a small tag whitelist.
//   - Otherwise, treat it as text and let the caller use whitespace-pre-wrap.
//
// Returned object lets the caller pick the right renderer:
//   { kind: "html", html }  → dangerouslySetInnerHTML
//   { kind: "text", text }  → {text} inside <div className="whitespace-pre-wrap">

const HTML_HINT = /<(p|br|ul|ol|li|strong|em|b|i|h[1-6]|a)\b/i;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "ul", "ol", "li", "strong", "em", "b", "i", "h2", "h3", "h4", "a"],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (_tag, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        rel: "nofollow noopener noreferrer",
        target: "_blank",
      },
    }),
  },
};

export type RenderedDescription =
  | { kind: "html"; html: string }
  | { kind: "text"; text: string };

export function renderDescription(raw: string): RenderedDescription {
  const s = raw ?? "";
  if (HTML_HINT.test(s)) {
    return { kind: "html", html: sanitizeHtml(s, SANITIZE_OPTIONS) };
  }
  return { kind: "text", text: s };
}

// Shorten a product name for display contexts with limited width (cards,
// breadcrumbs). Cuts on the first "—", "|", "(" or "," if present, then falls
// back to char truncation at a word boundary. DivaHub names tend to be
// keyword-stuffed; the first clause is usually the real product name.
export function shortName(name: string, max = 48): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  const cuts = [" — ", " | ", " (", " - "];
  for (const sep of cuts) {
    const idx = n.indexOf(sep);
    if (idx > 0 && idx <= max) return n.slice(0, idx).trim();
  }
  if (n.length <= max) return n;
  const slice = n.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim() + "…";
}
