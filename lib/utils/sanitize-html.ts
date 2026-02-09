import DOMPurify from "dompurify"

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Used for rendering email bodies and other untrusted HTML.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      "a", "b", "br", "blockquote", "code", "div", "em", "h1", "h2", "h3",
      "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "s",
      "span", "strong", "sub", "sup", "table", "tbody", "td", "th", "thead",
      "tr", "u", "ul",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "class", "style", "target", "rel",
      "width", "height", "colspan", "rowspan", "align", "valign",
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
  })
}
