import type { RedactionRule, Session } from '../lib/types';
import { DEFAULT_REDACTION_RULES } from '../lib/redaction/patterns';
import { getConfig, setConfig, getAllSessions } from '../lib/storage/indexeddb';

// Config keys
const CONFIG_KEYS = {
  CAPTURE_SCROLL: 'captureScrollEvents',
  DEBOUNCE_MS: 'debounceMs',
  MAX_EVENTS: 'maxEventsPerMinute',
  CUSTOM_RULES: 'customRedactionRules',
  DISABLED_DEFAULTS: 'disabledDefaultRules',
  MAX_INITIAL_HTML: 'maxInitialHTMLSize',
  DIFF_MODE: 'diffMode',
  INCLUDE_PARENT_CONTEXT: 'includeParentContext',
};

// DOM Elements - General Settings
const captureScrollEl = document.getElementById('capture-scroll') as HTMLInputElement;
const debounceMsEl = document.getElementById('debounce-ms') as HTMLInputElement;
const maxEventsEl = document.getElementById('max-events') as HTMLInputElement;

// DOM Elements - Export Settings
const maxInitialHtmlEl = document.getElementById('max-initial-html') as HTMLInputElement;
const diffModeEl = document.getElementById('diff-mode') as HTMLSelectElement;
const includeParentContextEl = document.getElementById('include-parent-context') as HTMLInputElement;

// DOM Elements - Rules
const defaultRulesEl = document.getElementById('default-rules')!;
const customRulesEl = document.getElementById('custom-rules')!;
const btnAddRule = document.getElementById('btn-add-rule')!;
const btnExportAll = document.getElementById('btn-export-all')!;
const btnClearAll = document.getElementById('btn-clear-all')!;
const saveStatusEl = document.getElementById('save-status')!;

// Modal elements
const ruleModal = document.getElementById('rule-modal') as HTMLDialogElement;
const ruleForm = document.getElementById('rule-form') as HTMLFormElement;
const ruleNameEl = document.getElementById('rule-name') as HTMLInputElement;
const ruleTypeEl = document.getElementById('rule-type') as HTMLSelectElement;
const rulePatternEl = document.getElementById('rule-pattern') as HTMLInputElement;
const ruleReplacementEl = document.getElementById('rule-replacement') as HTMLInputElement;
const patternHelpEl = document.getElementById('pattern-help')!;
const btnCancelRule = document.getElementById('btn-cancel-rule')!;

// Stats elements
const totalSessionsEl = document.getElementById('total-sessions')!;
const totalEventsEl = document.getElementById('total-events')!;
const storageUsedEl = document.getElementById('storage-used')!;

// Sessions list element
const sessionsListEl = document.getElementById('sessions-list')!;

// State
let customRules: RedactionRule[] = [];
let disabledDefaults: Set<string> = new Set();
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Loads settings from storage.
 */
async function loadSettings(): Promise<void> {
  try {
    // Load general settings
    const captureScroll = await getConfig<boolean>(CONFIG_KEYS.CAPTURE_SCROLL);
    const debounceMs = await getConfig<number>(CONFIG_KEYS.DEBOUNCE_MS);
    const maxEvents = await getConfig<number>(CONFIG_KEYS.MAX_EVENTS);
    const savedCustomRules = await getConfig<RedactionRule[]>(CONFIG_KEYS.CUSTOM_RULES);
    const savedDisabledDefaults = await getConfig<string[]>(CONFIG_KEYS.DISABLED_DEFAULTS);

    // Load export settings
    const maxInitialHtml = await getConfig<number>(CONFIG_KEYS.MAX_INITIAL_HTML);
    const diffMode = await getConfig<string>(CONFIG_KEYS.DIFF_MODE);
    const includeParentContext = await getConfig<boolean>(CONFIG_KEYS.INCLUDE_PARENT_CONTEXT);

    captureScrollEl.checked = captureScroll ?? false;
    debounceMsEl.value = (debounceMs ?? 100).toString();
    maxEventsEl.value = (maxEvents ?? 1000).toString();

    // Export settings (convert bytes to KB for display)
    maxInitialHtmlEl.value = ((maxInitialHtml ?? 100 * 1024) / 1024).toString();
    diffModeEl.value = diffMode ?? 'line';
    includeParentContextEl.checked = includeParentContext ?? true;

    customRules = savedCustomRules || [];
    disabledDefaults = new Set(savedDisabledDefaults || []);

    renderRules();
    await loadStats();
    await loadSessions();
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Saves settings to storage with debounce.
 */
function saveSettings(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    try {
      // General settings
      await setConfig(CONFIG_KEYS.CAPTURE_SCROLL, captureScrollEl.checked);
      await setConfig(CONFIG_KEYS.DEBOUNCE_MS, parseInt(debounceMsEl.value, 10));
      await setConfig(CONFIG_KEYS.MAX_EVENTS, parseInt(maxEventsEl.value, 10));
      await setConfig(CONFIG_KEYS.CUSTOM_RULES, customRules);
      await setConfig(CONFIG_KEYS.DISABLED_DEFAULTS, Array.from(disabledDefaults));

      // Export settings (convert KB to bytes for storage)
      await setConfig(CONFIG_KEYS.MAX_INITIAL_HTML, parseInt(maxInitialHtmlEl.value, 10) * 1024);
      await setConfig(CONFIG_KEYS.DIFF_MODE, diffModeEl.value);
      await setConfig(CONFIG_KEYS.INCLUDE_PARENT_CONTEXT, includeParentContextEl.checked);

      showSaveStatus();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, 500);
}

/**
 * Shows the save status indicator.
 */
function showSaveStatus(): void {
  saveStatusEl.hidden = false;
  setTimeout(() => {
    saveStatusEl.hidden = true;
  }, 2000);
}

/**
 * Renders all redaction rules.
 */
function renderRules(): void {
  // Render default rules
  defaultRulesEl.innerHTML = DEFAULT_REDACTION_RULES
    .map((rule) => renderRuleItem(rule, false))
    .join('');

  // Render custom rules
  if (customRules.length === 0) {
    customRulesEl.innerHTML = '<p class="empty-state">No custom rules defined.</p>';
  } else {
    customRulesEl.innerHTML = customRules
      .map((rule) => renderRuleItem(rule, true))
      .join('');
  }

  // Attach event listeners
  document.querySelectorAll('.rule-toggle').forEach((toggle) => {
    toggle.addEventListener('change', handleRuleToggle);
  });

  document.querySelectorAll('.btn-delete-rule').forEach((btn) => {
    btn.addEventListener('click', handleDeleteRule);
  });
}

/**
 * Renders a single rule item.
 */
function renderRuleItem(rule: RedactionRule, isCustom: boolean): string {
  const isEnabled = isCustom ? rule.enabled : !disabledDefaults.has(rule.id);

  return `
    <div class="rule-item" data-rule-id="${rule.id}" data-custom="${isCustom}">
      <div class="rule-info">
        <label class="checkbox-label">
          <input type="checkbox" class="rule-toggle" ${isEnabled ? 'checked' : ''}>
          <span class="rule-name">${escapeHtml(rule.name)}</span>
        </label>
        <div class="rule-meta">
          <span class="rule-type">${rule.type}</span>
          <code class="rule-pattern">${escapeHtml(truncate(rule.pattern, 40))}</code>
          <span class="rule-replacement">→ ${escapeHtml(rule.replacement)}</span>
        </div>
      </div>
      ${isCustom ? '<button class="btn-icon-only btn-delete-rule" title="Delete">×</button>' : ''}
    </div>
  `;
}

/**
 * Handles rule toggle changes.
 */
function handleRuleToggle(e: Event): void {
  const toggle = e.target as HTMLInputElement;
  const ruleItem = toggle.closest('.rule-item')!;
  const ruleId = ruleItem.getAttribute('data-rule-id')!;
  const isCustom = ruleItem.getAttribute('data-custom') === 'true';

  if (isCustom) {
    const rule = customRules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = toggle.checked;
    }
  } else {
    if (toggle.checked) {
      disabledDefaults.delete(ruleId);
    } else {
      disabledDefaults.add(ruleId);
    }
  }

  saveSettings();
}

/**
 * Handles rule deletion.
 */
function handleDeleteRule(e: Event): void {
  const btn = e.target as HTMLButtonElement;
  const ruleItem = btn.closest('.rule-item')!;
  const ruleId = ruleItem.getAttribute('data-rule-id')!;

  if (!confirm('Delete this custom rule?')) {
    return;
  }

  customRules = customRules.filter((r) => r.id !== ruleId);
  renderRules();
  saveSettings();
}

/**
 * Opens the add rule modal.
 */
function openAddRuleModal(): void {
  ruleForm.reset();
  ruleReplacementEl.value = '[REDACTED]';
  updatePatternHelp();
  ruleModal.showModal();
}

/**
 * Closes the rule modal.
 */
function closeRuleModal(): void {
  ruleModal.close();
}

/**
 * Updates the pattern help text based on selected type.
 */
function updatePatternHelp(): void {
  const helpTexts: Record<string, string> = {
    regex: 'Regular expression to match (e.g., \\b[A-Z0-9]{32}\\b)',
    selector: 'CSS selector (e.g., input[name*="api"], .secret-field)',
    'input-type': 'Input type attribute (e.g., password, hidden)',
    attribute: 'Comma-separated attribute names (e.g., data-secret,data-key)',
  };
  patternHelpEl.textContent = helpTexts[ruleTypeEl.value] || '';
}

/**
 * Handles rule form submission.
 */
function handleAddRule(e: Event): void {
  e.preventDefault();

  const newRule: RedactionRule = {
    id: `custom-${Date.now()}`,
    name: ruleNameEl.value.trim(),
    type: ruleTypeEl.value as RedactionRule['type'],
    pattern: rulePatternEl.value.trim(),
    replacement: ruleReplacementEl.value.trim() || '[REDACTED]',
    enabled: true,
  };

  // Validate regex if applicable
  if (newRule.type === 'regex') {
    try {
      new RegExp(newRule.pattern);
    } catch {
      alert('Invalid regular expression pattern');
      return;
    }
  }

  customRules.push(newRule);
  renderRules();
  saveSettings();
  closeRuleModal();
}

/**
 * Loads storage statistics.
 */
async function loadStats(): Promise<void> {
  try {
    const sessions = await getAllSessions();
    const totalEvents = sessions.reduce((sum, s) => sum + s.eventCount, 0);

    totalSessionsEl.textContent = sessions.length.toString();
    totalEventsEl.textContent = totalEvents.toLocaleString();

    // Estimate storage
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usedMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(2);
      storageUsedEl.textContent = `${usedMB} MB`;
    } else {
      storageUsedEl.textContent = 'N/A';
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

/**
 * Loads and displays sessions list.
 */
async function loadSessions(): Promise<void> {
  try {
    const sessions = await getAllSessions();

    if (!sessions || sessions.length === 0) {
      sessionsListEl.innerHTML = '<p class="empty-state">No sessions recorded yet.</p>';
      return;
    }

    sessionsListEl.innerHTML = sessions
      .map((session) => renderSessionItem(session))
      .join('');

    // Attach event listeners
    sessionsListEl.querySelectorAll('.session-item').forEach((item) => {
      const sessionId = item.getAttribute('data-session-id')!;

      item.querySelector('.btn-export')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportSession(sessionId);
      });

      item.querySelector('.btn-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(sessionId);
      });
    });
  } catch (error) {
    console.error('Failed to load sessions:', error);
    sessionsListEl.innerHTML = '<p class="empty-state">Failed to load sessions.</p>';
  }
}

/**
 * Renders a session list item.
 */
function renderSessionItem(session: Session): string {
  const date = new Date(session.startedAt).toLocaleDateString();
  const time = new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const duration = session.endedAt
    ? formatDuration(session.endedAt - session.startedAt)
    : 'In progress';

  return `
    <div class="session-item" data-session-id="${session.id}">
      <div class="session-info">
        <div class="session-title">${escapeHtml(truncate(session.title, 50))}</div>
        <div class="session-meta">
          <span>${date} ${time}</span>
          <span>•</span>
          <span>${duration}</span>
          <span>•</span>
          <span>${session.eventCount} events</span>
        </div>
      </div>
      <div class="session-actions">
        <button class="btn-icon-only btn-export" title="Export">⬇</button>
        <button class="btn-icon-only btn-delete" title="Delete">×</button>
      </div>
    </div>
  `;
}

/**
 * Exports a single session to Markdown.
 */
async function exportSession(sessionId: string): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_SESSION', sessionId });

    if (response.success && response.data) {
      const blob = new Blob([response.data], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dom-chronicle-${sessionId.substring(0, 8)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      throw new Error(response.error || 'Export failed');
    }
  } catch (error) {
    console.error('Failed to export session:', error);
    alert('Failed to export session');
  }
}

/**
 * Deletes a single session.
 */
async function deleteSession(sessionId: string): Promise<void> {
  if (!confirm('Delete this recording? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: 'DELETE_SESSION', sessionId });
    await loadSessions();
    await loadStats();
  } catch (error) {
    console.error('Failed to delete session:', error);
    alert('Failed to delete session');
  }
}

/**
 * Formats duration in ms to human-readable string.
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Exports all sessions.
 */
async function exportAllSessions(): Promise<void> {
  try {
    btnExportAll.textContent = 'Exporting...';
    btnExportAll.setAttribute('disabled', 'true');

    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_ALL_SESSIONS' });

    if (response.success && response.data) {
      const blob = new Blob([response.data], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dom-chronicle-export-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Failed to export sessions:', error);
    alert('Failed to export sessions');
  } finally {
    btnExportAll.textContent = 'Export All Sessions';
    btnExportAll.removeAttribute('disabled');
  }
}

/**
 * Clears all data.
 */
async function clearAllData(): Promise<void> {
  if (!confirm('Delete ALL recordings and settings? This cannot be undone.')) {
    return;
  }

  if (!confirm('Are you sure? This will permanently delete all data.')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' });
    customRules = [];
    disabledDefaults.clear();
    renderRules();
    await loadStats();
    await loadSessions();
    showSaveStatus();
  } catch (error) {
    console.error('Failed to clear data:', error);
    alert('Failed to clear data');
  }
}

// Helper functions
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.substring(0, len - 1) + '…' : str;
}

// Event listeners - General settings
captureScrollEl.addEventListener('change', saveSettings);
debounceMsEl.addEventListener('change', saveSettings);
maxEventsEl.addEventListener('change', saveSettings);

// Event listeners - Export settings
maxInitialHtmlEl.addEventListener('change', saveSettings);
diffModeEl.addEventListener('change', saveSettings);
includeParentContextEl.addEventListener('change', saveSettings);

// Event listeners - Rules and actions
btnAddRule.addEventListener('click', openAddRuleModal);
btnCancelRule.addEventListener('click', closeRuleModal);
ruleForm.addEventListener('submit', handleAddRule);
ruleTypeEl.addEventListener('change', updatePatternHelp);
btnExportAll.addEventListener('click', exportAllSessions);
btnClearAll.addEventListener('click', clearAllData);

// Close modal on backdrop click
ruleModal.addEventListener('click', (e) => {
  if (e.target === ruleModal) {
    closeRuleModal();
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', loadSettings);
