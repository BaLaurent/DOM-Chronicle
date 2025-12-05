import type {
  Session,
  DOMEvent,
  InputPayload,
  ClickPayload,
  MutationPayload,
  NavigationPayload,
  ScrollPayload,
  FocusPayload,
  ExportConfig,
} from '../types';
import {
  HEADER_TEMPLATE,
  LLM_CONTEXT,
  SUMMARY_TEMPLATE,
  EVENT_TYPE_LABELS,
  formatRelativeTime,
  formatDateTime,
  formatDuration,
  escapeMarkdown,
  codeBlock,
  truncate,
  formatUnifiedDiff,
  formatAddedDiff,
  formatRemovedDiff,
  formatAttributeDiff,
} from './templates';

export interface ExportOptions {
  includeReproductionSteps: boolean;
  maxDOMFragmentLength: number;
  groupMutations: boolean;
  exportConfig?: ExportConfig;
}

const DEFAULT_OPTIONS: ExportOptions = {
  includeReproductionSteps: true,
  maxDOMFragmentLength: 500,
  groupMutations: true,
};

/**
 * Exports session data to LLM-optimized Markdown format.
 */
export class MarkdownExporter {
  private options: ExportOptions;

  constructor(options?: Partial<ExportOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generates the full markdown export.
   */
  export(session: Session, events: DOMEvent[]): string {
    const sections = [
      this.renderHeader(session),
      LLM_CONTEXT,
    ];

    // Add initial page source if available
    const initialSource = this.renderInitialPageSource(events);
    if (initialSource) {
      sections.push('---', initialSource);
    }

    sections.push(
      '---',
      '## Timeline',
      this.renderTimeline(session, events),
      '---',
      this.renderSummary(events),
    );

    if (this.options.includeReproductionSteps) {
      sections.push('---', this.renderReproductionSteps(session, events));
    }

    return sections.join('\n\n');
  }

  /**
   * Renders the initial page source section.
   */
  private renderInitialPageSource(events: DOMEvent[]): string | null {
    // Find the first navigation event with initialHTML
    const navEvent = events.find(
      (e) =>
        e.type === 'user:navigation' &&
        (e.payload as NavigationPayload).initialHTML
    );

    if (!navEvent) return null;

    const payload = navEvent.payload as NavigationPayload;
    if (!payload.initialHTML) return null;

    return `## Initial Page Source\n\n${codeBlock(payload.initialHTML)}`;
  }

  /**
   * Renders the header section.
   */
  private renderHeader(session: Session): string {
    return HEADER_TEMPLATE
      .replace('{title}', escapeMarkdown(session.title))
      .replace('{url}', session.url)
      .replace('{startTime}', formatDateTime(session.startedAt))
      .replace('{endTime}', session.endedAt ? formatDateTime(session.endedAt) : 'In Progress')
      .replace('{duration}', session.endedAt ? formatDuration(session.startedAt, session.endedAt) : 'N/A')
      .replace('{eventCount}', session.eventCount.toString());
  }

  /**
   * Renders the timeline section.
   */
  private renderTimeline(session: Session, events: DOMEvent[]): string {
    const baseTime = session.startedAt;
    const rendered: string[] = [];

    // Add initial page load event
    rendered.push(this.renderInitialLoad(session));

    for (const event of events) {
      const eventMd = this.renderEvent(event, baseTime);
      if (eventMd) {
        rendered.push(eventMd);
      }
    }

    return rendered.join('\n\n');
  }

  /**
   * Renders the initial page load event.
   */
  private renderInitialLoad(session: Session): string {
    return `### 00:00.000 [ACTION] Page Load
Initial page loaded: **${escapeMarkdown(session.title)}**

${codeBlock(`<title>${escapeMarkdown(session.title)}</title>`)}`;
  }

  /**
   * Renders a single event.
   */
  private renderEvent(event: DOMEvent, baseTime: number): string | null {
    const time = formatRelativeTime(event.timestamp + baseTime, baseTime);
    const label = EVENT_TYPE_LABELS[event.type] || `[${event.type}]`;
    const description = this.describeEvent(event);
    const domFragment = this.renderDOMFragment(event);

    if (!description) return null;

    let md = `### ${time} ${label}\n${description}`;

    if (domFragment) {
      md += `\n\n${domFragment}`;
    }

    return md;
  }

  /**
   * Generates a human-readable description of an event.
   */
  private describeEvent(event: DOMEvent): string | null {
    const targetLabel = event.target.label
      ? `**"${escapeMarkdown(truncate(event.target.label, 50))}"**`
      : `**${event.target.tagName}**`;

    const selector = `(\`${event.target.cssSelector}\`)`;

    switch (event.type) {
      case 'user:click': {
        const payload = event.payload as ClickPayload;
        let desc = `User clicked ${targetLabel} ${selector}`;
        if (payload.modifiers.ctrl || payload.modifiers.shift || payload.modifiers.alt || payload.modifiers.meta) {
          const mods = [];
          if (payload.modifiers.ctrl) mods.push('Ctrl');
          if (payload.modifiers.shift) mods.push('Shift');
          if (payload.modifiers.alt) mods.push('Alt');
          if (payload.modifiers.meta) mods.push('Meta');
          desc += ` with ${mods.join('+')}`;
        }
        return desc;
      }

      case 'user:input': {
        const payload = event.payload as InputPayload;
        const fieldName = event.target.label || 'input field';
        let desc = `User typed in **"${escapeMarkdown(fieldName)}"** ${selector}`;

        // Check if value appears redacted
        const isRedacted = payload.value.startsWith('[') && payload.value.endsWith(']');
        if (isRedacted) {
          desc += `\n\n**Value:** \`${payload.value}\` *(redacted)*`;
        } else if (payload.value) {
          desc += `\n\n**Value:** \`${escapeMarkdown(truncate(payload.value, 100))}\``;
        }
        return desc;
      }

      case 'user:focus':
      case 'user:blur': {
        const payload = event.payload as FocusPayload;
        const action = payload.focused ? 'focused on' : 'left';
        return `User ${action} ${targetLabel} ${selector}`;
      }

      case 'user:scroll': {
        const payload = event.payload as ScrollPayload;
        return `Scrolled to position (${payload.scrollX}, ${payload.scrollY})`;
      }

      case 'user:navigation': {
        const payload = event.payload as NavigationPayload;
        return `Navigated to: \`${payload.url}\` (${payload.type})`;
      }

      case 'mutation:add': {
        const payload = event.payload as MutationPayload;
        const count = payload.addedNodes?.length || 0;
        let desc = `${count} element${count !== 1 ? 's' : ''} added to ${selector}`;

        // Add diff block
        const diffBlock = this.renderMutationDiff(payload, 'add');
        if (diffBlock) {
          desc += `\n\n${diffBlock}`;
        }
        return desc;
      }

      case 'mutation:remove': {
        const payload = event.payload as MutationPayload;
        const count = payload.removedNodes?.length || 0;
        let desc = `${count} element${count !== 1 ? 's' : ''} removed from ${selector}`;

        // Add diff block
        const diffBlock = this.renderMutationDiff(payload, 'remove');
        if (diffBlock) {
          desc += `\n\n${diffBlock}`;
        }
        return desc;
      }

      case 'mutation:attribute': {
        const payload = event.payload as MutationPayload;
        const diffContent = formatAttributeDiff(
          payload.attributeName || 'unknown',
          payload.oldValue || '',
          payload.newValue || ''
        );
        return `Attribute \`${payload.attributeName}\` changed on ${targetLabel}\n\n\`\`\`diff\n${diffContent}\n\`\`\``;
      }

      case 'mutation:text': {
        const payload = event.payload as MutationPayload;
        const diffContent = formatUnifiedDiff(
          payload.oldValue || '',
          payload.newValue || ''
        );
        return `Text content changed in ${targetLabel}\n\n\`\`\`diff\n${diffContent}\n\`\`\``;
      }

      default:
        return `Event: ${event.type}`;
    }
  }

  /**
   * Renders the DOM fragment for an event.
   */
  private renderDOMFragment(event: DOMEvent): string | null {
    if (!event.domSnapshot) return null;

    const html = truncate(event.domSnapshot.html, this.options.maxDOMFragmentLength);

    if (!html || html.length < 10) return null;

    return `**Element:**\n${codeBlock(html)}`;
  }

  /**
   * Renders a mutation as a diff block.
   */
  private renderMutationDiff(
    payload: MutationPayload,
    type: 'add' | 'remove'
  ): string | null {
    const diffMode = this.options.exportConfig?.diffMode ?? 'line';

    // If we have parent context, use unified diff
    if (payload.parentHTMLBefore && payload.parentHTMLAfter) {
      const diffContent = formatUnifiedDiff(
        payload.parentHTMLBefore,
        payload.parentHTMLAfter
      );
      if (diffContent) {
        return `\`\`\`diff\n${diffContent}\n\`\`\``;
      }
    }

    // Fallback: show added/removed nodes with +/- prefix
    if (type === 'add' && payload.addedNodes?.length) {
      const diffLines = payload.addedNodes
        .map((n) => formatAddedDiff(truncate(n.html, this.options.maxDOMFragmentLength)))
        .join('\n');
      return `\`\`\`diff\n${diffLines}\n\`\`\``;
    }

    if (type === 'remove' && payload.removedNodes?.length) {
      const diffLines = payload.removedNodes
        .map((n) => formatRemovedDiff(truncate(n.html, this.options.maxDOMFragmentLength)))
        .join('\n');
      return `\`\`\`diff\n${diffLines}\n\`\`\``;
    }

    return null;
  }

  /**
   * Renders the summary section.
   */
  private renderSummary(events: DOMEvent[]): string {
    const counts = {
      actions: 0,
      mutations: 0,
      errors: 0,
      navs: 0,
      redactions: 0,
    };

    for (const event of events) {
      if (event.type.startsWith('user:')) counts.actions++;
      else if (event.type.startsWith('mutation:')) counts.mutations++;
      else if (event.type.startsWith('error:')) counts.errors++;

      if (event.type === 'user:navigation') counts.navs++;

      // Count redactions (values that look like [REDACTED], [PASSWORD], etc.)
      if (event.type === 'user:input') {
        const payload = event.payload as InputPayload;
        if (payload.value.startsWith('[') && payload.value.endsWith(']')) {
          counts.redactions++;
        }
      }
    }

    return SUMMARY_TEMPLATE
      .replace('{actionCount}', counts.actions.toString())
      .replace('{mutationCount}', counts.mutations.toString())
      .replace('{errorCount}', counts.errors.toString())
      .replace('{navCount}', counts.navs.toString())
      .replace('{redactionCount}', counts.redactions.toString());
  }

  /**
   * Renders reproduction steps from user actions.
   */
  private renderReproductionSteps(session: Session, events: DOMEvent[]): string {
    const steps: string[] = [`1. Navigate to \`${session.url}\``];
    let stepNum = 2;

    for (const event of events) {
      const step = this.eventToStep(event);
      if (step) {
        steps.push(`${stepNum}. ${step}`);
        stepNum++;
      }
    }

    return `## Reproduction Steps\n\n${steps.join('\n')}`;
  }

  /**
   * Converts an event to a reproduction step.
   */
  private eventToStep(event: DOMEvent): string | null {
    const targetLabel = event.target.label || event.target.cssSelector;

    switch (event.type) {
      case 'user:click':
        return `Click "${truncate(targetLabel, 30)}"`;

      case 'user:input': {
        const payload = event.payload as InputPayload;
        const isRedacted = payload.value.startsWith('[') && payload.value.endsWith(']');
        return isRedacted
          ? `Fill "${truncate(targetLabel, 30)}" with ${payload.value}`
          : `Fill "${truncate(targetLabel, 30)}" with value`;
      }

      case 'user:navigation': {
        const payload = event.payload as NavigationPayload;
        return `Observe navigation to \`${payload.url}\``;
      }

      case 'user:scroll':
        return null; // Skip scroll events in reproduction

      case 'user:focus':
      case 'user:blur':
        return null; // Skip focus/blur in reproduction

      case 'mutation:add':
        return `Observe new element in "${truncate(targetLabel, 30)}"`;

      case 'mutation:remove':
        return `Observe element removed from "${truncate(targetLabel, 30)}"`;

      default:
        return null;
    }
  }
}

/**
 * Convenience function to export a session.
 */
export function exportToMarkdown(
  session: Session,
  events: DOMEvent[],
  options?: Partial<ExportOptions>
): string {
  const exporter = new MarkdownExporter(options);
  return exporter.export(session, events);
}
