# Technical Specification: DOM Chronicle
## Chrome Extension for DOM Change Recording & LLM-Ready Export

---

## 1. Executive Summary

**Product:** Chrome Extension (Manifest V3) that records all DOM mutations and user interactions, producing LLM-optimized Markdown exports with automatic PII redaction.

**Core Value Proposition:** Transform raw browser activity into structured, readable context that LLMs can understand and act upon — enabling bug reproduction, workflow documentation, and automation training.

---

## 2. Architecture Decision Analysis (Tree-of-Thought)

### 2.1 Capture Strategy**Selected: Hybrid Approach (C)**

| Criteria | Score | Rationale |
|----------|-------|-----------|
| Performance | ✅ | Raw capture in worker, semantic processing deferred |
| LLM Readability | ✅ | Post-processing converts to natural language |
| Completeness | ✅ | Nothing lost — raw data preserved until export |
| Complexity | ⚠️ | Acceptable trade-off for quality output |

---

### 2.2 Storage Strategy

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **IndexedDB only** | Unlimited storage, structured queries | Complex API | ✅ Selected |
| **localStorage** | Simple API | 5MB limit, blocks main thread | ❌ |
| **In-memory + periodic dump** | Fast | Data loss on crash | ❌ |

### 2.3 Redaction Strategy

| Option | Approach | Trade-offs | Verdict |
|--------|----------|------------|---------|
| **Capture-time redaction** | Redact before storing | Irreversible, but safest | ✅ Selected |
| **Export-time redaction** | Redact during export | PII stored temporarily | ❌ Risk |
| **User-reviewed redaction** | Manual step before export | Friction, error-prone | ❌ |

**Rationale:** PII should never hit storage. Redaction happens inline during capture. Users can configure patterns per session.

---

## 3. System Architecture---

## 4. Recording State Machine---

## 5. Data Model

### 5.1 Core Entities

```typescript
// Session: One recording session
interface Session {
  id: string;                    // UUID
  startedAt: number;             // Unix timestamp
  endedAt?: number;
  url: string;                   // Initial page URL
  title: string;                 // Page title
  config: SessionConfig;
  eventCount: number;
}

// SessionConfig: Per-session settings
interface SessionConfig {
  redactionRules: RedactionRule[];
  captureScrollEvents: boolean;
  captureMouseMovement: boolean;  // default: false (noisy)
  debounceMs: number;             // default: 100
  maxEventsPerMinute: number;     // throttle protection
}

// RedactionRule: Pattern-based PII removal
interface RedactionRule {
  id: string;
  name: string;
  type: 'input-type' | 'regex' | 'selector' | 'attribute';
  pattern: string;
  replacement: string;           // default: "[REDACTED]"
  enabled: boolean;
}

// DOMEvent: Single captured event
interface DOMEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  sequence: number;              // Ordering within session
  type: EventType;
  target: ElementDescriptor;
  payload: EventPayload;
  domSnapshot?: DOMFragment;     // Optional: relevant DOM context
}

type EventType = 
  | 'mutation:add' 
  | 'mutation:remove' 
  | 'mutation:attribute' 
  | 'mutation:text'
  | 'user:click'
  | 'user:input'
  | 'user:scroll'
  | 'user:navigation'
  | 'user:focus'
  | 'network:xhr'
  | 'network:fetch'
  | 'error:js'
  | 'error:console';

// ElementDescriptor: Semantic description of a DOM element
interface ElementDescriptor {
  tagName: string;
  id?: string;
  classes: string[];
  role?: string;                 // ARIA role
  label?: string;                // aria-label, innerText, or placeholder
  xpath: string;                 // Unique path for reproduction
  cssSelector: string;           // Alternative selector
  boundingRect?: DOMRect;        // Position at time of event
}

// EventPayload: Type-specific data
type EventPayload = 
  | MutationPayload
  | ClickPayload
  | InputPayload
  | ScrollPayload
  | NavigationPayload
  | ErrorPayload;

interface MutationPayload {
  mutationType: 'childList' | 'attributes' | 'characterData';
  addedNodes?: DOMFragment[];
  removedNodes?: DOMFragment[];
  attributeName?: string;
  oldValue?: string;
  newValue?: string;
}

interface ClickPayload {
  button: number;
  coordinates: { x: number; y: number };
  modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
}

interface InputPayload {
  inputType: string;
  value: string;                 // Post-redaction
  selectionStart?: number;
  selectionEnd?: number;
}

// DOMFragment: Cleaned DOM representation
interface DOMFragment {
  html: string;                  // Sanitized HTML
  text: string;                  // Visible text content
  attributes: Record<string, string>;
}
```

### 5.2 IndexedDB Schema

```javascript
const DB_NAME = 'dom-chronicle';
const DB_VERSION = 1;

const stores = {
  sessions: {
    keyPath: 'id',
    indexes: [
      { name: 'startedAt', keyPath: 'startedAt' },
      { name: 'url', keyPath: 'url' }
    ]
  },
  events: {
    keyPath: 'id',
    indexes: [
      { name: 'sessionId', keyPath: 'sessionId' },
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'type', keyPath: 'type' },
      { name: 'session-sequence', keyPath: ['sessionId', 'sequence'] }
    ]
  },
  config: {
    keyPath: 'key'  // Simple key-value for global settings
  }
};
```

---

## 6. Functional Requirements

### 6.1 Core Features (MVP)

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F1 | Start/Stop Recording | Toggle capture via popup button | Must |
| F2 | DOM Mutation Capture | MutationObserver on document.body | Must |
| F3 | User Event Capture | Click, input, focus, blur events | Must |
| F4 | Auto-Redaction | Apply rules before storage | Must |
| F5 | Markdown Export | Generate LLM-ready output | Must |
| F6 | Session Management | List, view, delete past sessions | Must |
| F7 | Default Redaction Rules | Password, email, phone, SSN patterns | Must |

### 6.2 Enhanced Features (v1.1)

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F8 | Custom Redaction Rules | User-defined regex patterns | Should |
| F9 | Scroll/Viewport Tracking | Record scroll position changes | Should |
| F10 | Network Request Logging | XHR/fetch with response summaries | Should |
| F11 | Console Error Capture | JS errors and console.error | Should |
| F12 | Per-Session Config | Override defaults for specific sessions | Should |

### 6.3 Advanced Features (v2.0)

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F13 | Screenshot Snapshots | Capture viewport at key moments | Could |
| F14 | Multi-Tab Sessions | Link related tabs in one session | Could |
| F15 | Export Templates | Customizable markdown formats | Could |
| F16 | LLM-Friendly Annotations | Auto-add context headers | Could |

---

## 7. Security Specification

### 7.1 Threat Model### 7.2 Default Redaction Rules

```javascript
const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  // Input type-based (highest priority)
  {
    id: 'input-password',
    name: 'Password fields',
    type: 'input-type',
    pattern: 'password',
    replacement: '[PASSWORD]',
    enabled: true
  },
  {
    id: 'input-hidden',
    name: 'Hidden inputs',
    type: 'input-type',
    pattern: 'hidden',
    replacement: '[HIDDEN]',
    enabled: true
  },
  
  // Regex patterns for common PII
  {
    id: 'regex-email',
    name: 'Email addresses',
    type: 'regex',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    replacement: '[EMAIL]',
    enabled: true
  },
  {
    id: 'regex-phone',
    name: 'Phone numbers',
    type: 'regex',
    pattern: '(\\+?1?[-.\\s]?)?(\\(?\\d{3}\\)?[-.\\s]?)?\\d{3}[-.\\s]?\\d{4}',
    replacement: '[PHONE]',
    enabled: true
  },
  {
    id: 'regex-ssn',
    name: 'Social Security Numbers',
    type: 'regex',
    pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    replacement: '[SSN]',
    enabled: true
  },
  {
    id: 'regex-credit-card',
    name: 'Credit card numbers',
    type: 'regex',
    pattern: '\\b(?:\\d{4}[- ]?){3}\\d{4}\\b',
    replacement: '[CARD]',
    enabled: true
  },
  
  // Selector-based (sensitive form fields)
  {
    id: 'selector-cvv',
    name: 'CVV fields',
    type: 'selector',
    pattern: 'input[name*="cvv"], input[name*="cvc"], input[autocomplete="cc-csc"]',
    replacement: '[CVV]',
    enabled: true
  },
  {
    id: 'selector-auth-token',
    name: 'Auth tokens',
    type: 'attribute',
    pattern: 'data-token,data-auth,data-session',
    replacement: '[TOKEN]',
    enabled: true
  }
];
```

### 7.3 Sensitive Domain Handling

```javascript
const SENSITIVE_DOMAINS = [
  // Banking & Finance
  /.*\.bank\..*/,
  /.*banking.*/,
  /paypal\.com/,
  /venmo\.com/,
  
  // Healthcare
  /.*\.health\..*/,
  /.*medical.*/,
  /.*patient.*/,
  
  // Auth providers
  /accounts\.google\.com/,
  /login\.microsoftonline\.com/,
  /auth0\.com/,
  
  // Password managers
  /.*lastpass.*/,
  /.*1password.*/,
  /.*bitwarden.*/
];

// Behavior: Show warning modal before recording starts on these domains
```

### 7.4 Content Security

| Concern | Implementation |
|---------|----------------|
| DOM Sanitization | DOMPurify before storage (strip scripts, event handlers) |
| No Eval | Never execute stored code |
| CSP Compliance | Extension uses strict CSP in manifest |
| Memory Limits | Max 10,000 events per session, auto-flush to IndexedDB |

---

## 8. Markdown Export Format

### 8.1 Export Structure

```markdown
# DOM Chronicle Recording
## Session: {session_title}

**URL:** {url}
**Recorded:** {start_time} - {end_time}
**Duration:** {duration}
**Events:** {event_count}

---

## Context for LLM

This recording captures user interactions and DOM changes on a web page.
Use this to understand what the user did and what happened in response.

**Format Guide:**
- `[ACTION]` = User-initiated action
- `[MUTATION]` = DOM change (automatic)
- `[ERROR]` = JavaScript or console error
- Code blocks contain relevant DOM fragments

---

## Timeline

### 00:00.000 [ACTION] Page Load
Initial page loaded.

```html
<title>Example Page</title>
```

### 00:02.341 [ACTION] Click
User clicked **"Submit" button** (`button#submit-btn`)

**Element:**
```html
<button id="submit-btn" class="btn btn-primary" type="submit">
  Submit
</button>
```

### 00:02.512 [MUTATION] Element Added
New element appeared in `form#contact-form`:

```html
<div class="error-message" role="alert">
  Please fill in all required fields
</div>
```

### 00:05.123 [ACTION] Input
User typed in **"Email" field** (`input#email`)

**Value:** `[EMAIL]` *(redacted)*

### 00:07.892 [ACTION] Click
User clicked **"Submit" button** (`button#submit-btn`)

### 00:08.102 [MUTATION] Element Removed
Element removed from `form#contact-form`:

```html
<div class="error-message" role="alert">...</div>
```

### 00:08.234 [MUTATION] Navigation
Page navigated to: `/success`

---

## Summary

| Metric | Value |
|--------|-------|
| Total Actions | 4 |
| Total Mutations | 3 |
| Errors | 0 |
| Redactions Applied | 1 |

---

## Reproduction Steps

1. Navigate to `{url}`
2. Click "Submit" button
3. Observe error message
4. Fill in email field
5. Click "Submit" button again
6. Observe navigation to success page
```

### 8.2 Export Engine Logic

```typescript
class MarkdownExporter {
  
  export(session: Session, events: DOMEvent[]): string {
    const sections = [
      this.renderHeader(session),
      this.renderLLMContext(),
      this.renderTimeline(events),
      this.renderSummary(session, events),
      this.renderReproductionSteps(events)
    ];
    
    return sections.join('\n\n---\n\n');
  }
  
  private renderTimelineEvent(event: DOMEvent): string {
    const time = this.formatTimestamp(event.timestamp);
    const type = this.getEventTypeLabel(event.type);
    const description = this.describeEvent(event);
    const domFragment = this.renderDOMFragment(event);
    
    return `### ${time} ${type}\n${description}\n\n${domFragment}`;
  }
  
  private describeEvent(event: DOMEvent): string {
    // Semantic, natural language description
    switch (event.type) {
      case 'user:click':
        const label = event.target.label || event.target.tagName;
        return `User clicked **"${label}"** (\`${event.target.cssSelector}\`)`;
      
      case 'user:input':
        const fieldName = event.target.label || 'input field';
        const value = (event.payload as InputPayload).value;
        return `User typed in **"${fieldName}"**\n\n**Value:** \`${value}\``;
      
      case 'mutation:add':
        return `New element appeared in \`${event.target.cssSelector}\`:`;
      
      // ... other cases
    }
  }
  
  private renderDOMFragment(event: DOMEvent): string {
    if (!event.domSnapshot) return '';
    
    const html = event.domSnapshot.html;
    // Truncate if too long, but keep meaningful structure
    const truncated = html.length > 500 
      ? html.substring(0, 500) + '\n<!-- truncated -->'
      : html;
    
    return '```html\n' + truncated + '\n```';
  }
}
```

---

## 9. Technical Implementation

### 9.1 Manifest V3

```json
{
  "manifest_version": 3,
  "name": "DOM Chronicle",
  "version": "1.0.0",
  "description": "Record DOM changes and export for LLM context",
  
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  
  "host_permissions": [
    "<all_urls>"
  ],
  
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  
  "options_page": "options.html",
  
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start",
      "all_frames": true
    }
  ],
  
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },
  
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 9.2 File Structure

```
dom-chronicle/
├── manifest.json
├── background.js           # Service worker
├── content.js              # Injected capture script
├── popup.html              # Extension popup
├── popup.js
├── options.html            # Settings page
├── options.js
├── lib/
│   ├── capture/
│   │   ├── mutation-observer.js
│   │   ├── event-listener.js
│   │   └── semantic-extractor.js
│   ├── redaction/
│   │   ├── engine.js
│   │   ├── patterns.js
│   │   └── sanitizer.js      # DOMPurify wrapper
│   ├── storage/
│   │   ├── indexeddb.js
│   │   └── session-manager.js
│   ├── export/
│   │   ├── markdown-exporter.js
│   │   └── templates.js
│   └── utils/
│       ├── element-descriptor.js
│       └── debounce.js
├── icons/
└── styles/
    ├── popup.css
    └── options.css
```

### 9.3 Core Capture Logic

```javascript
// content.js - Core capture implementation

class DOMChronicle {
  constructor() {
    this.isRecording = false;
    this.sessionId = null;
    this.sequence = 0;
    this.redactionEngine = new RedactionEngine();
    this.semanticExtractor = new SemanticExtractor();
    this.eventBuffer = [];
    this.flushInterval = null;
  }

  async start(config) {
    this.sessionId = crypto.randomUUID();
    this.sequence = 0;
    this.config = config;
    this.isRecording = true;
    
    await this.redactionEngine.loadRules(config.redactionRules);
    
    this.setupMutationObserver();
    this.setupEventListeners();
    this.startBufferFlush();
    
    this.captureInitialState();
  }

  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isRecording) return;
      
      for (const mutation of mutations) {
        this.processMutation(mutation);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeOldValue: true,
      characterDataOldValue: true
    });
  }

  processMutation(mutation) {
    const event = {
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      timestamp: performance.now(),
      sequence: this.sequence++,
      type: this.getMutationType(mutation),
      target: this.semanticExtractor.describe(mutation.target),
      payload: this.buildMutationPayload(mutation),
      domSnapshot: this.captureRelevantDOM(mutation)
    };

    // Redact before buffering
    const redactedEvent = this.redactionEngine.process(event);
    this.eventBuffer.push(redactedEvent);
  }

  setupEventListeners() {
    const captureEvent = (type) => (e) => {
      if (!this.isRecording) return;
      
      const event = {
        id: crypto.randomUUID(),
        sessionId: this.sessionId,
        timestamp: performance.now(),
        sequence: this.sequence++,
        type: `user:${type}`,
        target: this.semanticExtractor.describe(e.target),
        payload: this.buildEventPayload(type, e),
        domSnapshot: type === 'click' ? this.captureRelevantDOM(e) : null
      };

      const redactedEvent = this.redactionEngine.process(event);
      this.eventBuffer.push(redactedEvent);
    };

    document.addEventListener('click', captureEvent('click'), true);
    document.addEventListener('input', debounce(captureEvent('input'), 100), true);
    document.addEventListener('focus', captureEvent('focus'), true);
    document.addEventListener('blur', captureEvent('blur'), true);
    
    if (this.config.captureScrollEvents) {
      document.addEventListener('scroll', debounce(captureEvent('scroll'), 200), true);
    }
  }

  startBufferFlush() {
    // Flush buffer every 500ms to avoid blocking
    this.flushInterval = setInterval(() => {
      if (this.eventBuffer.length > 0) {
        const events = this.eventBuffer.splice(0);
        chrome.runtime.sendMessage({
          type: 'STORE_EVENTS',
          events: events
        });
      }
    }, 500);
  }

  stop() {
    this.isRecording = false;
    this.observer?.disconnect();
    clearInterval(this.flushInterval);
    
    // Final flush
    if (this.eventBuffer.length > 0) {
      chrome.runtime.sendMessage({
        type: 'STORE_EVENTS',
        events: this.eventBuffer.splice(0)
      });
    }
  }
}
```

### 9.4 Semantic Extractor

```javascript
// lib/capture/semantic-extractor.js

class SemanticExtractor {
  
  describe(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
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
      boundingRect: element.getBoundingClientRect?.()
    };
  }

  getRole(element) {
    // Explicit ARIA role
    if (element.getAttribute('role')) {
      return element.getAttribute('role');
    }
    
    // Implicit roles
    const implicitRoles = {
      'button': 'button',
      'a': 'link',
      'input': this.getInputRole(element),
      'select': 'combobox',
      'textarea': 'textbox',
      'img': 'img',
      'nav': 'navigation',
      'main': 'main',
      'header': 'banner',
      'footer': 'contentinfo',
      'form': 'form',
      'table': 'table'
    };
    
    return implicitRoles[element.tagName.toLowerCase()];
  }

  getLabel(element) {
    // Priority order for human-readable label
    const sources = [
      () => element.getAttribute('aria-label'),
      () => element.getAttribute('aria-labelledby') && 
            document.getElementById(element.getAttribute('aria-labelledby'))?.textContent,
      () => element.getAttribute('title'),
      () => element.getAttribute('alt'),
      () => element.getAttribute('placeholder'),
      () => element.tagName === 'INPUT' && this.findAssociatedLabel(element),
      () => element.textContent?.trim().substring(0, 50)
    ];

    for (const source of sources) {
      const label = source();
      if (label && label.trim()) {
        return label.trim();
      }
    }
    
    return null;
  }

  findAssociatedLabel(input) {
    // Check for <label for="id">
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent?.trim();
    }
    
    // Check for wrapping <label>
    const parent = input.closest('label');
    if (parent) {
      return parent.textContent?.replace(input.value || '', '').trim();
    }
    
    return null;
  }

  getCssSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }

    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector = `#${current.id}`;
        path.unshift(selector);
        break;
      }
      
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).slice(0, 2);
        if (classes.length) {
          selector += '.' + classes.join('.');
        }
      }

      // Add nth-child for disambiguation
      const siblings = current.parentElement?.children;
      if (siblings && siblings.length > 1) {
        const index = Array.from(siblings).indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;
      
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
}
```

---

## 10. User Interface

### 10.1 Popup Design---

## 11. Performance Considerations

### 11.1 Throttling & Debouncing

| Event Type | Strategy | Parameters |
|------------|----------|------------|
| DOM Mutations | Micro-batch | Collect for 50ms, process together |
| Input events | Debounce | 100ms delay |
| Scroll events | Throttle | Max 1 per 200ms |
| Click events | None | Capture immediately |

### 11.2 Memory Management

```javascript
const LIMITS = {
  MAX_EVENTS_IN_MEMORY: 500,      // Flush to IndexedDB after this
  MAX_DOM_FRAGMENT_SIZE: 2000,    // Characters per fragment
  MAX_EVENTS_PER_SESSION: 50000,  // Hard cap
  BUFFER_FLUSH_INTERVAL: 500,     // ms
  SESSION_AUTO_STOP_HOURS: 2      // Prevent runaway sessions
};
```

### 11.3 IndexedDB Optimization

```javascript
// Batch writes for performance
async function storeEventsBatch(events) {
  const db = await openDB();
  const tx = db.transaction('events', 'readwrite');
  const store = tx.objectStore('events');
  
  for (const event of events) {
    store.add(event);
  }
  
  await tx.done;
}

// Efficient session export with cursor
async function* iterateSessionEvents(sessionId) {
  const db = await openDB();
  const tx = db.transaction('events', 'readonly');
  const index = tx.store.index('session-sequence');
  const range = IDBKeyRange.bound(
    [sessionId, 0],
    [sessionId, Number.MAX_SAFE_INTEGER]
  );
  
  for await (const cursor of index.iterate(range)) {
    yield cursor.value;
  }
}
```

---

## 12. Implementation Roadmap

### Phase 1: MVP (2-3 weeks)

| Week | Deliverables |
|------|--------------|
| 1 | Project setup, manifest, basic popup UI |
| 1 | MutationObserver + event listeners |
| 2 | IndexedDB storage layer |
| 2 | Basic redaction (password, email patterns) |
| 3 | Markdown export |
| 3 | Session management UI |

### Phase 2: Polish (2 weeks)

| Week | Deliverables |
|------|--------------|
| 4 | Custom redaction rules UI |
| 4 | Sensitive domain warnings |
| 5 | Options page |
| 5 | Performance optimization |
| 5 | Testing & bug fixes |

### Phase 3: Advanced (Optional)

- Screenshot capture at key moments
- Multi-tab session linking
- Export templates (bug report, workflow doc, automation script)
- Keyboard shortcuts

---

## 13. Testing Strategy

| Layer | Approach | Tools |
|-------|----------|-------|
| Unit | Redaction engine, semantic extractor | Jest |
| Integration | Capture → Store → Export flow | Jest + fake IndexedDB |
| E2E | Full extension on test pages | Puppeteer/Playwright |
| Security | PII leak detection in exports | Custom fuzzer |

### Test Cases (Critical)

1. **Redaction completeness**: No password/email/SSN in export
2. **DOM sanitization**: No executable scripts in stored HTML
3. **Performance**: 10,000 events in 5 minutes without UI lag
4. **Export accuracy**: Timeline matches actual user actions
5. **Selector reliability**: CSS selectors resolve to correct elements