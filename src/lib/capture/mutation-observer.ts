import type { DOMEvent, MutationPayload, DOMFragment } from '../types';
import { SemanticExtractor } from './semantic-extractor';
import { LIMITS } from '../utils/constants';

export type MutationCallback = (event: DOMEvent) => void;

/**
 * Extended MutationRecord with captured parent state.
 */
interface MutationWithContext {
  record: MutationRecord;
  parentHTMLBefore?: string;  // Captured at mutation time
}

/**
 * Wrapper for MutationObserver that produces semantic events.
 */
export class MutationCapture {
  private observer: MutationObserver | null = null;
  private extractor: SemanticExtractor;
  private callback: MutationCallback;
  private sessionId: string = '';
  private sequence: number = 0;
  private batchBuffer: MutationWithContext[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private includeParentContext: boolean = true;

  constructor(callback: MutationCallback) {
    this.callback = callback;
    this.extractor = new SemanticExtractor();
  }

  /**
   * Starts observing DOM mutations.
   */
  start(sessionId: string, includeParentContext: boolean = true): void {
    this.sessionId = sessionId;
    this.sequence = 0;
    this.includeParentContext = includeParentContext;

    this.observer = new MutationObserver((mutations) => {
      this.batchMutations(mutations);
    });

    this.observer.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeOldValue: true,
      characterDataOldValue: true,
    });
  }

  /**
   * Stops observing DOM mutations.
   */
  stop(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.processBatch();
    }
    this.observer?.disconnect();
    this.observer = null;
  }

  /**
   * Batches mutations for micro-batching (50ms).
   * Captures parent state immediately for structural changes.
   */
  private batchMutations(mutations: MutationRecord[]): void {
    // Capture parent state NOW, before any delay
    const mutationsWithContext = mutations.map((m) => {
      const ctx: MutationWithContext = { record: m };

      if (this.includeParentContext && m.type === 'childList') {
        const parent = m.target instanceof Element ? m.target : m.target.parentElement;
        if (parent) {
          // Reconstruct "before" state by reversing the mutation
          ctx.parentHTMLBefore = this.reconstructBeforeState(parent, m);
        }
      }

      return ctx;
    });

    this.batchBuffer.push(...mutationsWithContext);

    if (this.batchTimeout === null) {
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
        this.batchTimeout = null;
      }, 50);
    }
  }

  /**
   * Reconstructs the parent's HTML before the mutation.
   */
  private reconstructBeforeState(parent: Element, mutation: MutationRecord): string {
    // Clone parent, reverse the mutation to get "before" state
    const clone = parent.cloneNode(true) as Element;

    // Remove added nodes from clone to get "before" state
    mutation.addedNodes.forEach((added) => {
      const match = Array.from(clone.childNodes).find((n) => n.isEqualNode(added));
      if (match) clone.removeChild(match);
    });

    // Add back removed nodes (at end - approximate position)
    mutation.removedNodes.forEach((removed) => {
      clone.appendChild(removed.cloneNode(true));
    });

    return clone.outerHTML;
  }

  /**
   * Processes batched mutations.
   */
  private processBatch(): void {
    const mutations = this.batchBuffer.splice(0);

    for (const mutation of mutations) {
      this.processMutation(mutation);
    }
  }

  /**
   * Processes a single mutation record.
   */
  private processMutation(mutationCtx: MutationWithContext): void {
    const event = this.createEvent(mutationCtx);
    if (event) {
      this.callback(event);
    }
  }

  /**
   * Creates a DOMEvent from a MutationRecord.
   */
  private createEvent(mutationCtx: MutationWithContext): DOMEvent | null {
    const mutation = mutationCtx.record;
    const type = this.getMutationType(mutation);
    if (!type) return null;

    const target = mutation.target instanceof Element
      ? mutation.target
      : mutation.target.parentElement;

    if (!target) return null;

    // Skip mutations in script/style elements
    if (this.shouldIgnore(target)) return null;

    const payload = this.buildPayload(mutationCtx);

    return {
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      timestamp: performance.now(),
      sequence: this.sequence++,
      type,
      target: this.extractor.describe(target),
      payload,
      domSnapshot: this.captureContext(mutation),
    };
  }

  /**
   * Gets the event type for a mutation.
   */
  private getMutationType(mutation: MutationRecord): DOMEvent['type'] | null {
    switch (mutation.type) {
      case 'childList':
        if (mutation.addedNodes.length > 0) return 'mutation:add';
        if (mutation.removedNodes.length > 0) return 'mutation:remove';
        return null;
      case 'attributes':
        return 'mutation:attribute';
      case 'characterData':
        return 'mutation:text';
      default:
        return null;
    }
  }

  /**
   * Builds the mutation payload.
   */
  private buildPayload(mutationCtx: MutationWithContext): MutationPayload {
    const mutation = mutationCtx.record;
    const payload: MutationPayload = {
      kind: 'mutation',
      mutationType: mutation.type,
    };

    if (mutation.type === 'childList') {
      if (mutation.addedNodes.length > 0) {
        payload.addedNodes = Array.from(mutation.addedNodes)
          .filter((n) => n instanceof Element)
          .slice(0, 10) // Limit to first 10 nodes
          .map((n) => this.extractor.captureFragment(n, LIMITS.MAX_DOM_FRAGMENT_SIZE))
          .filter((f): f is DOMFragment => f !== undefined);
      }
      if (mutation.removedNodes.length > 0) {
        payload.removedNodes = Array.from(mutation.removedNodes)
          .filter((n) => n instanceof Element)
          .slice(0, 10)
          .map((n) => this.extractor.captureFragment(n, LIMITS.MAX_DOM_FRAGMENT_SIZE))
          .filter((f): f is DOMFragment => f !== undefined);
      }

      // Add parent context for structural changes
      if (this.includeParentContext) {
        const parent = mutation.target instanceof Element
          ? mutation.target
          : mutation.target.parentElement;

        payload.parentHTMLBefore = mutationCtx.parentHTMLBefore;
        payload.parentHTMLAfter = parent?.outerHTML;
      }
    } else if (mutation.type === 'attributes') {
      payload.attributeName = mutation.attributeName || undefined;
      payload.oldValue = mutation.oldValue || undefined;
      payload.newValue = mutation.target instanceof Element
        ? mutation.target.getAttribute(mutation.attributeName || '') || undefined
        : undefined;
    } else if (mutation.type === 'characterData') {
      payload.oldValue = mutation.oldValue || undefined;
      payload.newValue = mutation.target.textContent || undefined;
    }

    return payload;
  }

  /**
   * Captures relevant DOM context for the mutation.
   */
  private captureContext(mutation: MutationRecord): DOMFragment | undefined {
    const target = mutation.target instanceof Element
      ? mutation.target
      : mutation.target.parentElement;

    return target ? this.extractor.captureFragment(target, LIMITS.MAX_DOM_FRAGMENT_SIZE) : undefined;
  }

  /**
   * Checks if a target should be ignored.
   */
  private shouldIgnore(element: Element): boolean {
    const ignoredTags = ['script', 'style', 'noscript', 'link', 'meta'];
    return ignoredTags.includes(element.tagName.toLowerCase());
  }
}
