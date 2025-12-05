// Database configuration
export const DB_NAME = 'dom-chronicle';
export const DB_VERSION = 1;

// Store names
export const STORES = {
  SESSIONS: 'sessions',
  EVENTS: 'events',
  CONFIG: 'config',
} as const;

// Performance limits
export const LIMITS = {
  MAX_EVENTS_IN_MEMORY: 500,
  MAX_DOM_FRAGMENT_SIZE: 2000,
  MAX_EVENTS_PER_SESSION: 50000,
  BUFFER_FLUSH_INTERVAL: 500,
  SESSION_AUTO_STOP_HOURS: 2,
  INPUT_DEBOUNCE_MS: 100,
  SCROLL_THROTTLE_MS: 200,
} as const;

// Default export configuration
export const DEFAULT_EXPORT_CONFIG = {
  maxInitialHTMLSize: 100 * 1024,  // 100KB default
  diffMode: 'line' as const,
  includeParentContext: true,
};

// Default session configuration
export const DEFAULT_SESSION_CONFIG = {
  captureScrollEvents: false,
  captureMouseMovement: false,
  debounceMs: 100,
  maxEventsPerMinute: 1000,
  exportConfig: DEFAULT_EXPORT_CONFIG,
};

// Sensitive domains that trigger warnings
export const SENSITIVE_DOMAINS = [
  /.*\.bank\..*/,
  /.*banking.*/,
  /paypal\.com/,
  /venmo\.com/,
  /.*\.health\..*/,
  /.*medical.*/,
  /.*patient.*/,
  /accounts\.google\.com/,
  /login\.microsoftonline\.com/,
  /auth0\.com/,
  /.*lastpass.*/,
  /.*1password.*/,
  /.*bitwarden.*/,
];
