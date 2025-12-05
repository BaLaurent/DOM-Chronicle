import type { RedactionRule } from '../types';

/**
 * Default redaction rules for common PII patterns.
 */
export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  // Input type-based (highest priority)
  {
    id: 'input-password',
    name: 'Password fields',
    type: 'input-type',
    pattern: 'password',
    replacement: '[PASSWORD]',
    enabled: true,
  },
  {
    id: 'input-hidden',
    name: 'Hidden inputs',
    type: 'input-type',
    pattern: 'hidden',
    replacement: '[HIDDEN]',
    enabled: true,
  },

  // Regex patterns for common PII
  {
    id: 'regex-email',
    name: 'Email addresses',
    type: 'regex',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    replacement: '[EMAIL]',
    enabled: true,
  },
  {
    id: 'regex-phone',
    name: 'Phone numbers',
    type: 'regex',
    pattern: '(\\+?1?[-.\\s]?)?(\\(?\\d{3}\\)?[-.\\s]?)?\\d{3}[-.\\s]?\\d{4}',
    replacement: '[PHONE]',
    enabled: true,
  },
  {
    id: 'regex-ssn',
    name: 'Social Security Numbers',
    type: 'regex',
    pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    replacement: '[SSN]',
    enabled: true,
  },
  {
    id: 'regex-credit-card',
    name: 'Credit card numbers',
    type: 'regex',
    pattern: '\\b(?:\\d{4}[- ]?){3}\\d{4}\\b',
    replacement: '[CARD]',
    enabled: true,
  },
  {
    id: 'regex-ip-address',
    name: 'IP addresses',
    type: 'regex',
    pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    replacement: '[IP]',
    enabled: false, // Disabled by default
  },

  // Selector-based (sensitive form fields)
  {
    id: 'selector-cvv',
    name: 'CVV fields',
    type: 'selector',
    pattern: 'input[name*="cvv"], input[name*="cvc"], input[autocomplete="cc-csc"]',
    replacement: '[CVV]',
    enabled: true,
  },

  // Attribute-based
  {
    id: 'attr-auth-token',
    name: 'Auth tokens',
    type: 'attribute',
    pattern: 'data-token,data-auth,data-session,data-csrf',
    replacement: '[TOKEN]',
    enabled: true,
  },
];

/**
 * Sensitive domains that trigger recording warnings.
 */
export const SENSITIVE_DOMAINS: RegExp[] = [
  // Banking & Finance
  /.*\.bank\..*/i,
  /.*banking.*/i,
  /paypal\.com/i,
  /venmo\.com/i,
  /stripe\.com/i,
  /square\.com/i,

  // Healthcare
  /.*\.health\..*/i,
  /.*medical.*/i,
  /.*patient.*/i,
  /.*\.gov\/health/i,

  // Auth providers
  /accounts\.google\.com/i,
  /login\.microsoftonline\.com/i,
  /auth0\.com/i,
  /okta\.com/i,
  /login\.salesforce\.com/i,

  // Password managers
  /.*lastpass.*/i,
  /.*1password.*/i,
  /.*bitwarden.*/i,
  /.*dashlane.*/i,

  // Government
  /.*\.gov$/i,
  /.*\.mil$/i,
];

/**
 * Checks if a URL matches any sensitive domain pattern.
 */
export function isSensitiveDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return SENSITIVE_DOMAINS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}
