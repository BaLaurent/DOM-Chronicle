declare module '../vendor/dompurify.min.js' {
  interface DOMPurifyConfig {
    ALLOWED_TAGS?: string[];
    ALLOWED_ATTR?: string[];
    FORBID_TAGS?: string[];
    FORBID_ATTR?: string[];
    ALLOW_DATA_ATTR?: boolean;
    ALLOW_UNKNOWN_PROTOCOLS?: boolean;
    SAFE_FOR_TEMPLATES?: boolean;
    WHOLE_DOCUMENT?: boolean;
    RETURN_DOM?: boolean;
    RETURN_DOM_FRAGMENT?: boolean;
    RETURN_DOM_IMPORT?: boolean;
    RETURN_TRUSTED_TYPE?: boolean;
    FORCE_BODY?: boolean;
    SANITIZE_DOM?: boolean;
    KEEP_CONTENT?: boolean;
    IN_PLACE?: boolean;
    USE_PROFILES?: {
      html?: boolean;
      svg?: boolean;
      svgFilters?: boolean;
      mathMl?: boolean;
    };
    ADD_TAGS?: string[];
    ADD_ATTR?: string[];
    ADD_URI_SAFE_ATTR?: string[];
    FORBID_CONTENTS?: string[];
    CUSTOM_ELEMENT_HANDLING?: {
      tagNameCheck?: RegExp | ((tagName: string) => boolean);
      attributeNameCheck?: RegExp | ((attrName: string) => boolean);
      allowCustomizedBuiltInElements?: boolean;
    };
  }

  interface DOMPurify {
    sanitize(dirty: string | Node, config?: DOMPurifyConfig): string;
    sanitize(dirty: string | Node, config: DOMPurifyConfig & { RETURN_DOM_FRAGMENT: true }): DocumentFragment;
    sanitize(dirty: string | Node, config: DOMPurifyConfig & { RETURN_DOM: true }): HTMLElement;
    setConfig(config: DOMPurifyConfig): void;
    clearConfig(): void;
    isValidAttribute(tag: string, attr: string, value: string): boolean;
    addHook(entryPoint: string, hookFunction: (node: Node, data: object, config: DOMPurifyConfig) => Node | void): void;
    removeHook(entryPoint: string): void;
    removeHooks(entryPoint: string): void;
    removeAllHooks(): void;
    version: string;
    removed: Array<{ attribute?: Attr; element?: Node }>;
    isSupported: boolean;
  }

  const DOMPurify: DOMPurify;
  export default DOMPurify;
}

// Global declaration for UMD usage
declare global {
  interface Window {
    DOMPurify: import('../vendor/dompurify.min.js').default;
  }
}
