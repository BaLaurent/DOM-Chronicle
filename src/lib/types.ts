// Session: One recording session
export interface Session {
  id: string;
  startedAt: number;
  endedAt?: number;
  url: string;
  title: string;
  config: SessionConfig;
  eventCount: number;
}

// ExportConfig: Export format settings
export interface ExportConfig {
  maxInitialHTMLSize: number;      // bytes, 0 = unlimited
  diffMode: 'line' | 'element';    // line-by-line or whole element
  includeParentContext: boolean;   // capture parent before/after for structural changes
}

// SessionConfig: Per-session settings
export interface SessionConfig {
  redactionRules: RedactionRule[];
  captureScrollEvents: boolean;
  captureMouseMovement: boolean;
  debounceMs: number;
  maxEventsPerMinute: number;
  exportConfig: ExportConfig;
}

// RedactionRule: Pattern-based PII removal
export interface RedactionRule {
  id: string;
  name: string;
  type: 'input-type' | 'regex' | 'selector' | 'attribute';
  pattern: string;
  replacement: string;
  enabled: boolean;
}

// DOMEvent: Single captured event
export interface DOMEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  sequence: number;
  type: EventType;
  target: ElementDescriptor;
  payload: EventPayload;
  domSnapshot?: DOMFragment;
}

export type EventType =
  | 'mutation:add'
  | 'mutation:remove'
  | 'mutation:attribute'
  | 'mutation:text'
  | 'user:click'
  | 'user:input'
  | 'user:scroll'
  | 'user:navigation'
  | 'user:focus'
  | 'user:blur'
  | 'network:xhr'
  | 'network:fetch'
  | 'error:js'
  | 'error:console';

// ElementDescriptor: Semantic description of a DOM element
export interface ElementDescriptor {
  tagName: string;
  id?: string;
  classes: string[];
  role?: string;
  label?: string;
  xpath: string;
  cssSelector: string;
  boundingRect?: { x: number; y: number; width: number; height: number };
}

// EventPayload: Type-specific data
export type EventPayload =
  | MutationPayload
  | ClickPayload
  | InputPayload
  | ScrollPayload
  | NavigationPayload
  | FocusPayload
  | ErrorPayload;

export interface MutationPayload {
  kind: 'mutation';
  mutationType: 'childList' | 'attributes' | 'characterData';
  addedNodes?: DOMFragment[];
  removedNodes?: DOMFragment[];
  attributeName?: string;
  oldValue?: string;
  newValue?: string;
  parentHTMLBefore?: string;  // Parent state before mutation (for structural changes)
  parentHTMLAfter?: string;   // Parent state after mutation (for structural changes)
}

export interface ClickPayload {
  kind: 'click';
  button: number;
  coordinates: { x: number; y: number };
  modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
}

export interface InputPayload {
  kind: 'input';
  inputType: string;
  value: string;
  selectionStart?: number;
  selectionEnd?: number;
}

export interface ScrollPayload {
  kind: 'scroll';
  scrollX: number;
  scrollY: number;
}

export interface NavigationPayload {
  kind: 'navigation';
  url: string;
  type: 'pushState' | 'replaceState' | 'popstate' | 'hashchange' | 'pageload';
  initialHTML?: string;  // Full page source on load
}

export interface FocusPayload {
  kind: 'focus';
  focused: boolean;
}

export interface ErrorPayload {
  kind: 'error';
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
}

// DOMFragment: Cleaned DOM representation
export interface DOMFragment {
  html: string;
  text: string;
  attributes: Record<string, string>;
}

// Message types for chrome.runtime communication
export type MessageType =
  | { type: 'START_RECORDING'; config: SessionConfig }
  | { type: 'STOP_RECORDING' }
  | { type: 'GET_STATUS' }
  | { type: 'STORE_EVENTS'; events: DOMEvent[] }
  | { type: 'EXPORT_SESSION'; sessionId: string }
  | { type: 'DELETE_SESSION'; sessionId: string }
  | { type: 'GET_SESSIONS' };

export type MessageResponse =
  | { success: true; data?: unknown }
  | { success: false; error: string };

// Recording state
export type RecordingState = 'idle' | 'recording' | 'paused';
