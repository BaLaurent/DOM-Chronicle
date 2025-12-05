import type { DOMEvent, SessionConfig, RedactionRule, RecordingState } from './lib/types';
import { MutationCapture } from './lib/capture/mutation-observer';
import { EventCapture, EventCaptureConfig } from './lib/capture/event-listener';
import { RedactionEngine } from './lib/redaction/engine';
import { LIMITS } from './lib/utils/constants';

/**
 * DOM Chronicle content script.
 * Runs in the context of each web page to capture DOM events.
 */
class DOMChronicle {
  private isRecording: boolean = false;
  private sessionId: string | null = null;
  private config: SessionConfig | null = null;

  private redactionEngine: RedactionEngine;
  private mutationCapture: MutationCapture;
  private eventCapture: EventCapture | null = null;

  private eventBuffer: DOMEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private sequence: number = 0;

  constructor() {
    this.redactionEngine = new RedactionEngine();

    // Initialize mutation capture with callback
    this.mutationCapture = new MutationCapture((event) => {
      this.handleEvent(event);
    });

    // Listen for messages from background script
    this.setupMessageListener();
  }

  /**
   * Sets up the message listener for background script communication.
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
      return true; // Keep channel open for async response
    });
  }

  /**
   * Handles messages from the background script.
   */
  private async handleMessage(
    message: { type: string; [key: string]: unknown },
    sendResponse: (response: unknown) => void
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'START_RECORDING':
          await this.start(message.sessionId as string, message.config as SessionConfig);
          sendResponse({ success: true });
          break;

        case 'STOP_RECORDING':
          await this.stop();
          sendResponse({ success: true });
          break;

        case 'GET_STATUS':
          sendResponse({
            success: true,
            data: {
              isRecording: this.isRecording,
              sessionId: this.sessionId,
              eventCount: this.sequence,
            },
          });
          break;

        case 'UPDATE_CONFIG':
          if (this.config) {
            this.config = { ...this.config, ...(message.config as Partial<SessionConfig>) };
          }
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Starts recording DOM events.
   */
  async start(sessionId: string, config: SessionConfig): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    this.sessionId = sessionId;
    this.config = config;
    this.sequence = 0;
    this.eventBuffer = [];
    this.isRecording = true;

    // Load redaction rules
    this.redactionEngine.loadRules(config.redactionRules);

    // Start mutation observer with parent context config
    const includeParentContext = config.exportConfig?.includeParentContext ?? true;
    this.mutationCapture.start(sessionId, includeParentContext);

    // Start event capture
    const eventConfig: Partial<EventCaptureConfig> = {
      captureScrollEvents: config.captureScrollEvents,
      debounceMs: config.debounceMs,
    };

    this.eventCapture = new EventCapture((event) => {
      this.handleEvent(event);
    }, eventConfig);

    this.eventCapture.start(sessionId, this.sequence);

    // Start buffer flush interval
    this.startBufferFlush();

    // Capture initial page state
    this.captureInitialState();

    console.log('[DOM Chronicle] Recording started for session:', sessionId);
  }

  /**
   * Stops recording DOM events.
   */
  async stop(): Promise<void> {
    if (!this.isRecording) return;

    this.isRecording = false;

    // Stop observers
    this.mutationCapture.stop();
    this.eventCapture?.stop();
    this.eventCapture = null;

    // Stop flush interval
    this.stopBufferFlush();

    // Final flush
    await this.flushBuffer();

    console.log('[DOM Chronicle] Recording stopped. Total events:', this.sequence);

    this.sessionId = null;
    this.config = null;
  }

  /**
   * Handles an incoming DOM event.
   */
  private handleEvent(event: DOMEvent): void {
    if (!this.isRecording || !this.config) return;

    // Check rate limit
    if (!this.checkRateLimit()) {
      console.warn('[DOM Chronicle] Rate limit exceeded, dropping event');
      return;
    }

    // Apply redaction
    const redactedEvent = this.redactionEngine.process(event);

    // Update sequence
    redactedEvent.sequence = this.sequence++;

    // Add to buffer
    this.eventBuffer.push(redactedEvent);

    // Flush if buffer is full
    if (this.eventBuffer.length >= LIMITS.MAX_EVENTS_IN_MEMORY) {
      this.flushBuffer();
    }
  }

  /**
   * Captures the initial page state including full HTML source.
   */
  private captureInitialState(): void {
    if (!this.sessionId) return;

    // Capture full page HTML (respecting size limit)
    let initialHTML = document.documentElement.outerHTML;
    const maxSize = this.config?.exportConfig?.maxInitialHTMLSize ?? 0;

    if (maxSize > 0 && initialHTML.length > maxSize) {
      initialHTML = initialHTML.substring(0, maxSize) + '\n<!-- TRUNCATED -->';
    }

    // Capture page title, URL and full HTML as navigation event
    const event: DOMEvent = {
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      timestamp: performance.now(),
      sequence: this.sequence++,
      type: 'user:navigation',
      target: {
        tagName: 'document',
        classes: [],
        xpath: '/',
        cssSelector: ':root',
      },
      payload: {
        kind: 'navigation',
        url: window.location.href,
        type: 'pageload',
        initialHTML: initialHTML,
      },
    };

    this.eventBuffer.push(event);
  }

  /**
   * Starts the buffer flush interval.
   */
  private startBufferFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flushBuffer();
    }, LIMITS.BUFFER_FLUSH_INTERVAL);
  }

  /**
   * Stops the buffer flush interval.
   */
  private stopBufferFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Flushes the event buffer to the background script.
   */
  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = this.eventBuffer.splice(0);

    try {
      await chrome.runtime.sendMessage({
        type: 'STORE_EVENTS',
        events,
      });
    } catch (error) {
      console.error('[DOM Chronicle] Failed to flush events:', error);
      // Put events back in buffer (at the beginning)
      this.eventBuffer.unshift(...events);
    }
  }

  /**
   * Checks if we're within the rate limit.
   */
  private checkRateLimit(): boolean {
    if (!this.config) return false;

    // Simple check: sequence number shouldn't exceed max events
    const maxPerSession = LIMITS.MAX_EVENTS_PER_SESSION;
    if (this.sequence >= maxPerSession) {
      console.warn('[DOM Chronicle] Session event limit reached');
      this.stop();
      return false;
    }

    return true;
  }
}

// Initialize the content script
const domChronicle = new DOMChronicle();

// Export for testing (if needed)
(window as unknown as { __domChronicle?: DOMChronicle }).__domChronicle = domChronicle;

console.log('[DOM Chronicle] Content script loaded');
