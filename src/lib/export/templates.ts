/**
 * Markdown template constants and helpers.
 */

export const HEADER_TEMPLATE = `# DOM Chronicle Recording
## Session: {title}

**URL:** {url}
**Recorded:** {startTime} - {endTime}
**Duration:** {duration}
**Events:** {eventCount}
`;

export const LLM_CONTEXT = `## Context for LLM

This recording captures user interactions and DOM changes on a web page.
Use this to understand what the user did and what happened in response.

**Format Guide:**
- \`[ACTION]\` = User-initiated action
- \`[MUTATION]\` = DOM change (automatic)
- \`[ERROR]\` = JavaScript or console error
- \`[NAV]\` = Navigation event
- Code blocks contain relevant DOM fragments
`;

export const SUMMARY_TEMPLATE = `## Summary

| Metric | Value |
|--------|-------|
| Total Actions | {actionCount} |
| Total Mutations | {mutationCount} |
| Errors | {errorCount} |
| Navigations | {navCount} |
| Redactions Applied | {redactionCount} |
`;

/**
 * Event type labels for human-readable output.
 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  'mutation:add': '[MUTATION] Element Added',
  'mutation:remove': '[MUTATION] Element Removed',
  'mutation:attribute': '[MUTATION] Attribute Changed',
  'mutation:text': '[MUTATION] Text Changed',
  'user:click': '[ACTION] Click',
  'user:input': '[ACTION] Input',
  'user:scroll': '[ACTION] Scroll',
  'user:navigation': '[NAV] Navigation',
  'user:focus': '[ACTION] Focus',
  'user:blur': '[ACTION] Blur',
  'network:xhr': '[NETWORK] XHR Request',
  'network:fetch': '[NETWORK] Fetch Request',
  'error:js': '[ERROR] JavaScript Error',
  'error:console': '[ERROR] Console Error',
};

/**
 * Formats a timestamp as relative time (MM:SS.mmm).
 */
export function formatRelativeTime(timestampMs: number, baseMs: number): string {
  const elapsed = timestampMs - baseMs;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  const millis = Math.floor(elapsed % 1000);

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

/**
 * Formats a Unix timestamp as ISO date string.
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Formats duration in human-readable format.
 */
export function formatDuration(startMs: number, endMs: number): string {
  const durationMs = endMs - startMs;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Escapes special markdown characters in text.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([*_`\[\]()#>])/g, '\\$1');
}

/**
 * Creates a markdown code block.
 */
export function codeBlock(content: string, language: string = 'html'): string {
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

/**
 * Truncates text to a maximum length with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Generate unified diff between two strings (line-by-line).
 * Uses a simple approach: shows removed lines then added lines.
 */
export function formatUnifiedDiff(before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  const result: string[] = [];

  // Find lines that exist only in before (removed)
  beforeLines.forEach((line) => {
    if (!afterLines.includes(line)) {
      result.push(`- ${line}`);
    }
  });

  // Find lines that exist only in after (added)
  afterLines.forEach((line) => {
    if (!beforeLines.includes(line)) {
      result.push(`+ ${line}`);
    }
  });

  return result.join('\n');
}

/**
 * Format HTML as added (+ prefix each line).
 */
export function formatAddedDiff(html: string): string {
  return html
    .split('\n')
    .map((line) => `+ ${line}`)
    .join('\n');
}

/**
 * Format HTML as removed (- prefix each line).
 */
export function formatRemovedDiff(html: string): string {
  return html
    .split('\n')
    .map((line) => `- ${line}`)
    .join('\n');
}

/**
 * Format attribute change as diff.
 */
export function formatAttributeDiff(name: string, oldVal: string, newVal: string): string {
  return `- ${name}="${oldVal}"\n+ ${name}="${newVal}"`;
}
