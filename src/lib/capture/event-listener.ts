import type {
  DOMEvent,
  ClickPayload,
  InputPayload,
  ScrollPayload,
  FocusPayload,
  NavigationPayload,
} from '../types';
import { SemanticExtractor } from './semantic-extractor';
import { debounce, throttle } from '../utils/debounce';
import { LIMITS } from '../utils/constants';

export type EventCallback = (event: DOMEvent) => void;

export interface EventCaptureConfig {
  captureScrollEvents: boolean;
  captureMouseMovement: boolean;
  debounceMs: number;
}

/**
 * Captures user interaction events.
 */
export class EventCapture {
  private extractor: SemanticExtractor;
  private callback: EventCallback;
  private sessionId: string = '';
  private sequence: number = 0;
  private config: EventCaptureConfig;
  private listeners: Array<{ target: EventTarget; type: string; handler: EventListener }> = [];

  constructor(callback: EventCallback, config?: Partial<EventCaptureConfig>) {
    this.callback = callback;
    this.extractor = new SemanticExtractor();
    this.config = {
      captureScrollEvents: false,
      captureMouseMovement: false,
      debounceMs: LIMITS.INPUT_DEBOUNCE_MS,
      ...config,
    };
  }

  /**
   * Starts capturing user events.
   */
  start(sessionId: string, startSequence: number = 0): void {
    this.sessionId = sessionId;
    this.sequence = startSequence;

    // Click events (immediate)
    this.addListener(document, 'click', this.handleClick.bind(this), true);

    // Input events (debounced)
    const debouncedInput = debounce(this.handleInput.bind(this), this.config.debounceMs);
    this.addListener(document, 'input', debouncedInput as EventListener, true);

    // Focus/blur events
    this.addListener(document, 'focus', this.handleFocus.bind(this), true);
    this.addListener(document, 'blur', this.handleBlur.bind(this), true);

    // Scroll events (throttled, optional)
    if (this.config.captureScrollEvents) {
      const throttledScroll = throttle(this.handleScroll.bind(this), LIMITS.SCROLL_THROTTLE_MS);
      this.addListener(document, 'scroll', throttledScroll as EventListener, true);
    }

    // Navigation events
    this.addListener(window, 'popstate', this.handleNavigation.bind(this));
    this.addListener(window, 'hashchange', this.handleNavigation.bind(this));

    // Intercept history API
    this.interceptHistoryAPI();
  }

  /**
   * Stops capturing user events.
   */
  stop(): void {
    for (const { target, type, handler } of this.listeners) {
      target.removeEventListener(type, handler, true);
    }
    this.listeners = [];
  }

  /**
   * Adds an event listener and tracks it for cleanup.
   */
  private addListener(
    target: EventTarget,
    type: string,
    handler: EventListener,
    capture: boolean = false
  ): void {
    target.addEventListener(type, handler, capture);
    this.listeners.push({ target, type, handler });
  }

  /**
   * Handles click events.
   */
  private handleClick(e: Event): void {
    const mouseEvent = e as MouseEvent;
    const target = e.target as Element;

    if (!target) return;

    const payload: ClickPayload = {
      kind: 'click',
      button: mouseEvent.button,
      coordinates: { x: mouseEvent.clientX, y: mouseEvent.clientY },
      modifiers: {
        ctrl: mouseEvent.ctrlKey,
        shift: mouseEvent.shiftKey,
        alt: mouseEvent.altKey,
        meta: mouseEvent.metaKey,
      },
    };

    this.emit('user:click', target, payload);
  }

  /**
   * Handles input events.
   */
  private handleInput(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

    if (!target) return;

    const payload: InputPayload = {
      kind: 'input',
      inputType: target.type || 'text',
      value: target.value || '',
      selectionStart: 'selectionStart' in target ? target.selectionStart ?? undefined : undefined,
      selectionEnd: 'selectionEnd' in target ? target.selectionEnd ?? undefined : undefined,
    };

    this.emit('user:input', target, payload);
  }

  /**
   * Handles focus events.
   */
  private handleFocus(e: Event): void {
    const target = e.target as Element;
    if (!target) return;

    const payload: FocusPayload = { kind: 'focus', focused: true };
    this.emit('user:focus', target, payload);
  }

  /**
   * Handles blur events.
   */
  private handleBlur(e: Event): void {
    const target = e.target as Element;
    if (!target) return;

    const payload: FocusPayload = { kind: 'focus', focused: false };
    this.emit('user:blur', target, payload);
  }

  /**
   * Handles scroll events.
   */
  private handleScroll(_e: Event): void {
    const payload: ScrollPayload = {
      kind: 'scroll',
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };

    this.emit('user:scroll', document.documentElement, payload);
  }

  /**
   * Handles navigation events.
   */
  private handleNavigation(e: Event): void {
    const type = e.type === 'popstate' ? 'popstate' : 'hashchange';

    const payload: NavigationPayload = {
      kind: 'navigation',
      url: window.location.href,
      type,
    };

    this.emit('user:navigation', document.documentElement, payload);
  }

  /**
   * Intercepts history.pushState and history.replaceState.
   */
  private interceptHistoryAPI(): void {
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = (...args) => {
      originalPushState(...args);
      this.emitNavigation('pushState');
    };

    history.replaceState = (...args) => {
      originalReplaceState(...args);
      this.emitNavigation('replaceState');
    };
  }

  /**
   * Emits a navigation event.
   */
  private emitNavigation(type: 'pushState' | 'replaceState'): void {
    const payload: NavigationPayload = {
      kind: 'navigation',
      url: window.location.href,
      type,
    };

    this.emit('user:navigation', document.documentElement, payload);
  }

  /**
   * Emits a DOM event.
   */
  private emit(
    type: DOMEvent['type'],
    target: Element,
    payload: DOMEvent['payload']
  ): void {
    const event: DOMEvent = {
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      timestamp: performance.now(),
      sequence: this.sequence++,
      type,
      target: this.extractor.describe(target),
      payload,
      domSnapshot: type === 'user:click'
        ? this.extractor.captureFragment(target, LIMITS.MAX_DOM_FRAGMENT_SIZE)
        : undefined,
    };

    this.callback(event);
  }

  /**
   * Gets current sequence number.
   */
  getSequence(): number {
    return this.sequence;
  }
}
