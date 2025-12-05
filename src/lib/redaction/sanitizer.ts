// @ts-ignore - DOMPurify is vendored
import DOMPurify from '../../vendor/dompurify.min.js';

/**
 * Sanitization configuration for DOM fragments.
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'span', 'p', 'a', 'button', 'input', 'textarea', 'select', 'option',
    'form', 'label', 'fieldset', 'legend', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'header', 'footer', 'nav', 'main', 'article', 'section', 'aside',
    'img', 'figure', 'figcaption', 'video', 'audio', 'source',
    'strong', 'em', 'b', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
    'br', 'hr', 'pre', 'code', 'blockquote', 'cite', 'abbr', 'time',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'href', 'src', 'alt', 'title', 'type', 'name', 'value',
    'placeholder', 'disabled', 'readonly', 'checked', 'selected',
    'role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
    'data-testid', 'data-cy', 'data-test',
    'for', 'action', 'method', 'target', 'rel',
    'width', 'height', 'colspan', 'rowspan',
  ],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'],
  FORBID_ATTR: [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmouseout', 'onmousemove', 'onkeydown', 'onkeyup', 'onkeypress',
    'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onload',
    'onerror', 'onabort', 'onscroll', 'onresize',
    'style', // Prevent inline styles
  ],
  KEEP_CONTENT: true,
  ALLOW_DATA_ATTR: false,
};

/**
 * Sanitizes HTML string, removing scripts and dangerous content.
 */
export function sanitizeHTML(dirty: string): string {
  return DOMPurify.sanitize(dirty, SANITIZE_CONFIG);
}

/**
 * Sanitizes and truncates HTML to a maximum length.
 */
export function sanitizeAndTruncate(dirty: string, maxLength: number): string {
  const clean = sanitizeHTML(dirty);

  if (clean.length <= maxLength) {
    return clean;
  }

  // Find a good truncation point (end of a tag)
  const truncated = clean.substring(0, maxLength);
  const lastTagEnd = truncated.lastIndexOf('>');

  if (lastTagEnd > maxLength * 0.8) {
    return truncated.substring(0, lastTagEnd + 1) + '\n<!-- truncated -->';
  }

  return truncated + '<!-- truncated -->';
}

/**
 * Extracts clean text content from HTML.
 */
export function extractText(html: string): string {
  const clean = sanitizeHTML(html);

  // Create temporary element to extract text
  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = clean;
    return temp.textContent || '';
  }

  // Fallback: strip tags with regex (less accurate)
  return clean.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Sanitizes attributes object, removing dangerous ones.
 */
export function sanitizeAttributes(attrs: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  const forbidden = new Set(SANITIZE_CONFIG.FORBID_ATTR);
  const allowed = new Set(SANITIZE_CONFIG.ALLOWED_ATTR);

  for (const [key, value] of Object.entries(attrs)) {
    // Skip forbidden attributes
    if (forbidden.has(key.toLowerCase())) continue;

    // Skip javascript: URLs
    if (key === 'href' || key === 'src') {
      if (value.toLowerCase().startsWith('javascript:')) continue;
      if (value.toLowerCase().startsWith('data:')) continue;
    }

    // Only include allowed attributes
    if (allowed.has(key.toLowerCase()) || key.startsWith('aria-')) {
      result[key] = value;
    }
  }

  return result;
}
