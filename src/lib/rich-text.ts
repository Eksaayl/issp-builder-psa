const ALLOWED_TAGS = new Set(["strong", "em", "u", "ul", "li", "br"]);
// document.execCommand("bold"/"italic") produces <b>/<i> in Chrome, not
// <strong>/<em> — normalize them so formatting survives sanitization.
// ol → ul: a pasted numbered list becomes a bullet list (structure kept).
const TAG_ALIASES: Record<string, string> = { b: "strong", i: "em", ol: "ul" };
const RICH_TAG_RE = /<(strong|em|u|ul|ol|li|br)[ >/]/i;

// Block-level tags from paste: their *closing* tag is replaced with <br> so
// pasted paragraphs/headings do not merge into one run of text when the
// opening tag is stripped.
const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre",
]);

export function isRichText(value: string): boolean {
  return RICH_TAG_RE.test(value);
}

// Pre-pass: strip markup the tag-stripping regex below cannot see — comments,
// CDATA, SGML declarations (DOCTYPE), and processing instructions — so it
// cannot survive into the stored/rendered HTML. Order matters: comments and
// CDATA are removed before the generic `<!...>` rule because both can contain
// a `>` inside.
function stripUnsafeMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")            // HTML comments
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")    // CDATA sections
    .replace(/<![^>]*>/g, "")                    // DOCTYPE + other declarations
    .replace(/<\?[\s\S]*?\?>/g, "");             // processing instructions
}

export function sanitizeRichText(html: string): string {
  return stripUnsafeMarkup(html).replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g, (match, rawTag: string) => {
    const tag = TAG_ALIASES[rawTag.toLowerCase()] ?? rawTag.toLowerCase();
    const isClosing = match.startsWith("</");
    if (ALLOWED_TAGS.has(tag)) {
      if (tag === "br") return isClosing ? "" : "<br>";
      return isClosing ? `</${tag}>` : `<${tag}>`;
    }
    if (BLOCK_TAGS.has(tag)) {
      return isClosing ? "<br>" : "";
    }
    return "";
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function legacyToHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}
