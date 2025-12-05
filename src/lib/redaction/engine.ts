import type { RedactionRule, DOMEvent, InputPayload, ElementDescriptor } from '../types';
import { DEFAULT_REDACTION_RULES } from './patterns';

export class RedactionEngine {
  private rules: RedactionRule[] = [];
  private compiledRegex: Map<string, RegExp> = new Map();

  /**
   * Loads redaction rules and compiles regex patterns.
   */
  loadRules(customRules?: RedactionRule[]): void {
    this.rules = [...DEFAULT_REDACTION_RULES, ...(customRules || [])];

    // Pre-compile regex patterns
    this.compiledRegex.clear();
    for (const rule of this.rules) {
      if (rule.type === 'regex' && rule.enabled) {
        try {
          this.compiledRegex.set(rule.id, new RegExp(rule.pattern, 'gi'));
        } catch (e) {
          console.warn(`Invalid regex pattern in rule ${rule.id}:`, e);
        }
      }
    }
  }

  /**
   * Processes an event and redacts PII.
   */
  process(event: DOMEvent): DOMEvent {
    const redacted = { ...event };

    // Redact target element label
    if (redacted.target.label) {
      redacted.target = {
        ...redacted.target,
        label: this.redactText(redacted.target.label),
      };
    }

    // Redact payload based on event type
    if (event.type === 'user:input' && event.payload) {
      const inputPayload = event.payload as InputPayload;

      // Check input-type rules
      if (this.shouldRedactInputType(event.target, inputPayload.inputType)) {
        redacted.payload = {
          ...inputPayload,
          value: this.getReplacementForInputType(event.target, inputPayload.inputType),
        };
      } else {
        // Apply regex redaction to value
        redacted.payload = {
          ...inputPayload,
          value: this.redactText(inputPayload.value),
        };
      }
    }

    // Redact DOM snapshot
    if (redacted.domSnapshot) {
      redacted.domSnapshot = {
        ...redacted.domSnapshot,
        html: this.redactText(redacted.domSnapshot.html),
        text: this.redactText(redacted.domSnapshot.text),
        attributes: this.redactAttributes(redacted.domSnapshot.attributes),
      };
    }

    return redacted;
  }

  /**
   * Redacts PII from text using regex rules.
   */
  redactText(text: string): string {
    let result = text;

    for (const rule of this.rules) {
      if (!rule.enabled || rule.type !== 'regex') continue;

      const regex = this.compiledRegex.get(rule.id);
      if (regex) {
        result = result.replace(regex, rule.replacement);
        regex.lastIndex = 0; // Reset for global regex
      }
    }

    return result;
  }

  /**
   * Checks if an input should be fully redacted based on type.
   */
  private shouldRedactInputType(target: ElementDescriptor, inputType: string): boolean {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (rule.type === 'input-type' && rule.pattern === inputType) {
        return true;
      }

      if (rule.type === 'selector' && target.cssSelector) {
        try {
          const patterns = rule.pattern.split(',').map((p) => p.trim());
          for (const pattern of patterns) {
            if (this.matchesSelectorPattern(target, pattern)) {
              return true;
            }
          }
        } catch {
          // Invalid selector pattern
        }
      }
    }

    return false;
  }

  /**
   * Gets the replacement text for a redacted input type.
   */
  private getReplacementForInputType(target: ElementDescriptor, inputType: string): string {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (rule.type === 'input-type' && rule.pattern === inputType) {
        return rule.replacement;
      }

      if (rule.type === 'selector') {
        const patterns = rule.pattern.split(',').map((p) => p.trim());
        for (const pattern of patterns) {
          if (this.matchesSelectorPattern(target, pattern)) {
            return rule.replacement;
          }
        }
      }
    }

    return '[REDACTED]';
  }

  /**
   * Simple selector pattern matching against element descriptor.
   */
  private matchesSelectorPattern(target: ElementDescriptor, pattern: string): boolean {
    // Match by tag name
    if (pattern.startsWith(target.tagName)) {
      // Check attribute patterns like input[name*="cvv"]
      const attrMatch = pattern.match(/\[(\w+)([*^$]?)="([^"]+)"\]/);
      if (attrMatch) {
        const [, attr, op, value] = attrMatch;

        // Check ID
        if (attr === 'id' && target.id) {
          return this.matchAttributeValue(target.id, op, value);
        }

        // Check autocomplete in cssSelector (approximation)
        if (attr === 'autocomplete' && target.cssSelector.includes(value)) {
          return true;
        }

        // Check name in cssSelector
        if (attr === 'name' && target.cssSelector.includes(value)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Matches attribute values with operators.
   */
  private matchAttributeValue(actual: string, op: string, expected: string): boolean {
    switch (op) {
      case '*':
        return actual.includes(expected);
      case '^':
        return actual.startsWith(expected);
      case '$':
        return actual.endsWith(expected);
      default:
        return actual === expected;
    }
  }

  /**
   * Redacts sensitive attributes from an attributes object.
   */
  private redactAttributes(attrs: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(attrs)) {
      // Check attribute-type rules
      let redacted = false;
      for (const rule of this.rules) {
        if (!rule.enabled || rule.type !== 'attribute') continue;

        const patterns = rule.pattern.split(',').map((p) => p.trim());
        if (patterns.includes(key)) {
          result[key] = rule.replacement;
          redacted = true;
          break;
        }
      }

      if (!redacted) {
        result[key] = this.redactText(value);
      }
    }

    return result;
  }

  /**
   * Gets all active rules.
   */
  getRules(): RedactionRule[] {
    return [...this.rules];
  }

  /**
   * Toggles a rule by ID.
   */
  toggleRule(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Adds a custom rule.
   */
  addRule(rule: RedactionRule): void {
    this.rules.push(rule);
    if (rule.type === 'regex' && rule.enabled) {
      try {
        this.compiledRegex.set(rule.id, new RegExp(rule.pattern, 'gi'));
      } catch {
        // Invalid regex
      }
    }
  }
}
