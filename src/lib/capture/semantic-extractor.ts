import type { ElementDescriptor, DOMFragment } from '../types';

/**
 * Extracts semantic description from a DOM element.
 */
export class SemanticExtractor {
  /**
   * Creates a semantic description of an element.
   */
  describe(element: Element | Node | null): ElementDescriptor {
    if (!element || !(element instanceof Element)) {
      return this.describeNonElement(element);
    }

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || undefined,
      classes: Array.from(element.classList),
      role: this.getRole(element),
      label: this.getLabel(element),
      xpath: this.getXPath(element),
      cssSelector: this.getCssSelector(element),
      boundingRect: this.getBoundingRect(element),
    };
  }

  /**
   * Creates a description for non-element nodes.
   */
  private describeNonElement(node: Node | null): ElementDescriptor {
    return {
      tagName: node?.nodeName.toLowerCase() || 'unknown',
      classes: [],
      xpath: '',
      cssSelector: '',
    };
  }

  /**
   * Gets the ARIA role (explicit or implicit).
   */
  private getRole(element: Element): string | undefined {
    // Explicit ARIA role
    const explicitRole = element.getAttribute('role');
    if (explicitRole) return explicitRole;

    // Implicit roles by tag
    const implicitRoles: Record<string, string | ((el: Element) => string | undefined)> = {
      button: 'button',
      a: 'link',
      input: (el) => this.getInputRole(el as HTMLInputElement),
      select: 'combobox',
      textarea: 'textbox',
      img: 'img',
      nav: 'navigation',
      main: 'main',
      header: 'banner',
      footer: 'contentinfo',
      form: 'form',
      table: 'table',
      ul: 'list',
      ol: 'list',
      li: 'listitem',
      dialog: 'dialog',
      article: 'article',
      section: 'region',
      aside: 'complementary',
    };

    const tagName = element.tagName.toLowerCase();
    const role = implicitRoles[tagName];

    if (typeof role === 'function') {
      return role(element);
    }
    return role;
  }

  /**
   * Gets the role for input elements based on type.
   */
  private getInputRole(input: HTMLInputElement): string | undefined {
    const typeRoles: Record<string, string> = {
      text: 'textbox',
      password: 'textbox',
      email: 'textbox',
      tel: 'textbox',
      url: 'textbox',
      search: 'searchbox',
      number: 'spinbutton',
      range: 'slider',
      checkbox: 'checkbox',
      radio: 'radio',
      button: 'button',
      submit: 'button',
      reset: 'button',
      image: 'button',
    };
    return typeRoles[input.type] || 'textbox';
  }

  /**
   * Gets a human-readable label for the element.
   */
  getLabel(element: Element): string | undefined {
    const sources: (() => string | null | undefined)[] = [
      () => element.getAttribute('aria-label'),
      () => {
        const labelledBy = element.getAttribute('aria-labelledby');
        return labelledBy ? document.getElementById(labelledBy)?.textContent : null;
      },
      () => element.getAttribute('title'),
      () => element.getAttribute('alt'),
      () => element.getAttribute('placeholder'),
      () => this.findAssociatedLabel(element),
      () => {
        const text = element.textContent?.trim();
        return text && text.length <= 50 ? text : text?.substring(0, 47) + '...';
      },
    ];

    for (const source of sources) {
      const label = source();
      if (label?.trim()) {
        return label.trim();
      }
    }

    return undefined;
  }

  /**
   * Finds an associated label element.
   */
  private findAssociatedLabel(element: Element): string | null {
    // Check for <label for="id">
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent?.trim() || null;
    }

    // Check for wrapping <label>
    const parentLabel = element.closest('label');
    if (parentLabel) {
      // Remove the input's own text from the label
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      const inputs = clone.querySelectorAll('input, select, textarea');
      inputs.forEach((input) => input.remove());
      return clone.textContent?.trim() || null;
    }

    return null;
  }

  /**
   * Generates a CSS selector for the element.
   */
  getCssSelector(element: Element): string {
    // If has ID, use it
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      // Add ID if present
      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      // Add classes (first two)
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).slice(0, 2);
        if (classes.length) {
          selector += '.' + classes.map((c) => CSS.escape(c)).join('.');
        }
      }

      // Add nth-child for disambiguation
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const sameTagSiblings = siblings.filter((s) => s.tagName === current!.tagName);
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Generates an XPath for the element.
   */
  getXPath(element: Element): string {
    // If has ID, use it
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling: Element | null = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    return '/' + parts.join('/');
  }

  /**
   * Gets bounding rectangle for the element.
   */
  private getBoundingRect(element: Element): { x: number; y: number; width: number; height: number } | undefined {
    try {
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Captures a DOM fragment from an element.
   */
  captureFragment(element: Element | Node | null, maxLength: number = 2000): DOMFragment | undefined {
    if (!element) return undefined;

    let html = '';
    let text = '';
    const attributes: Record<string, string> = {};

    if (element instanceof Element) {
      // Clone and sanitize will be done by redaction engine
      html = element.outerHTML.substring(0, maxLength);
      text = element.textContent?.trim().substring(0, 500) || '';

      // Extract attributes
      for (const attr of element.attributes) {
        attributes[attr.name] = attr.value;
      }
    } else if (element.nodeType === Node.TEXT_NODE) {
      text = element.textContent?.trim() || '';
      html = text;
    }

    return { html, text, attributes };
  }
}
