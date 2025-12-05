import type { Session, DOMEvent, SessionConfig, RecordingState } from './lib/types';
import {
  startSession,
  stopSession,
  getCurrentSession,
  getRecordingState,
  storeEvents,
  listSessions,
  getSessionById,
  getEventsForSession,
  removeSession,
  restoreState,
  checkAutoStop,
} from './lib/storage/session-manager';
import { getConfig, setConfig, openDB } from './lib/storage/indexeddb';
import { exportToMarkdown } from './lib/export/markdown-exporter';
import { isSensitiveDomain, DEFAULT_REDACTION_RULES } from './lib/redaction/patterns';
import { DEFAULT_SESSION_CONFIG, DEFAULT_EXPORT_CONFIG } from './lib/utils/constants';

// State
let activeTabId: number | null = null;
let eventCount: number = 0;
let autoStopInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the service worker.
 */
async function initialize(): Promise<void> {
  console.log('[DOM Chronicle] Background service worker starting...');

  // Ensure database is ready
  await openDB();

  // Restore state from any interrupted sessions
  await restoreState();

  console.log('[DOM Chronicle] Background service worker ready');
}

/**
 * Handles messages from popup, options, and content scripts.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async response
});

/**
 * Main message handler.
 */
async function handleMessage(
  message: { type: string; [key: string]: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    switch (message.type) {
      // Recording control
      case 'START_RECORDING':
        await handleStartRecording(sendResponse);
        break;

      case 'STOP_RECORDING':
        await handleStopRecording(sendResponse);
        break;

      case 'GET_STATUS':
        handleGetStatus(sendResponse);
        break;

      // Event storage (from content script)
      case 'STORE_EVENTS':
        await handleStoreEvents(message.events as DOMEvent[], sendResponse);
        break;

      // Session management
      case 'GET_SESSIONS':
        await handleGetSessions(sendResponse);
        break;

      case 'EXPORT_SESSION':
        await handleExportSession(message.sessionId as string, sendResponse);
        break;

      case 'DELETE_SESSION':
        await handleDeleteSession(message.sessionId as string, sendResponse);
        break;

      case 'EXPORT_ALL_SESSIONS':
        await handleExportAllSessions(sendResponse);
        break;

      case 'CLEAR_ALL_DATA':
        await handleClearAllData(sendResponse);
        break;

      // Domain check
      case 'CHECK_SENSITIVE_DOMAIN':
        handleCheckSensitiveDomain(message.url as string, sendResponse);
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('[DOM Chronicle] Error handling message:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handles START_RECORDING message.
 */
async function handleStartRecording(
  sendResponse: (response: unknown) => void
): Promise<void> {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url) {
    sendResponse({ success: false, error: 'No active tab' });
    return;
  }

  // Load config
  const config = await loadSessionConfig();

  // Start session
  const session = await startSession(tab.url, tab.title || 'Untitled', config);

  // Store active tab
  activeTabId = tab.id;
  eventCount = 0;

  // Inject content script and start recording
  await chrome.tabs.sendMessage(tab.id, {
    type: 'START_RECORDING',
    sessionId: session.id,
    config,
  });

  // Update extension icon
  await updateIcon('recording');

  // Start auto-stop check
  startAutoStopCheck();

  sendResponse({ success: true, data: session });
}

/**
 * Handles STOP_RECORDING message.
 */
async function handleStopRecording(
  sendResponse: (response: unknown) => void
): Promise<void> {
  if (activeTabId) {
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: 'STOP_RECORDING' });
    } catch {
      // Tab might be closed
    }
  }

  const session = await stopSession();

  activeTabId = null;
  eventCount = 0;

  // Update extension icon
  await updateIcon('idle');

  // Stop auto-stop check
  stopAutoStopCheck();

  sendResponse({ success: true, data: session });
}

/**
 * Handles GET_STATUS message.
 */
function handleGetStatus(sendResponse: (response: unknown) => void): void {
  const state = getRecordingState();
  const session = getCurrentSession();

  sendResponse({
    success: true,
    data: {
      state,
      session,
      eventCount,
    },
  });
}

/**
 * Handles STORE_EVENTS message from content script.
 */
async function handleStoreEvents(
  events: DOMEvent[],
  sendResponse: (response: unknown) => void
): Promise<void> {
  await storeEvents(events);
  eventCount += events.length;

  // Notify popup of updated count
  chrome.runtime.sendMessage({
    type: 'EVENT_COUNT_UPDATE',
    count: eventCount,
  }).catch(() => {
    // Popup might not be open
  });

  sendResponse({ success: true });
}

/**
 * Handles GET_SESSIONS message.
 */
async function handleGetSessions(
  sendResponse: (response: unknown) => void
): Promise<void> {
  const sessions = await listSessions();
  sendResponse({ success: true, data: sessions });
}

/**
 * Handles EXPORT_SESSION message.
 */
async function handleExportSession(
  sessionId: string,
  sendResponse: (response: unknown) => void
): Promise<void> {
  const session = await getSessionById(sessionId);

  if (!session) {
    sendResponse({ success: false, error: 'Session not found' });
    return;
  }

  const events = await getEventsForSession(sessionId);
  const markdown = exportToMarkdown(session, events);

  sendResponse({ success: true, data: markdown });
}

/**
 * Handles DELETE_SESSION message.
 */
async function handleDeleteSession(
  sessionId: string,
  sendResponse: (response: unknown) => void
): Promise<void> {
  await removeSession(sessionId);
  sendResponse({ success: true });
}

/**
 * Handles EXPORT_ALL_SESSIONS message.
 */
async function handleExportAllSessions(
  sendResponse: (response: unknown) => void
): Promise<void> {
  const sessions = await listSessions();
  const exports: string[] = [];

  for (const session of sessions) {
    const events = await getEventsForSession(session.id);
    const markdown = exportToMarkdown(session, events);
    exports.push(markdown);
  }

  const combined = exports.join('\n\n---\n\n');
  sendResponse({ success: true, data: combined });
}

/**
 * Handles CLEAR_ALL_DATA message.
 */
async function handleClearAllData(
  sendResponse: (response: unknown) => void
): Promise<void> {
  // Stop any active recording
  if (getRecordingState() === 'recording') {
    await stopSession();
    activeTabId = null;
    eventCount = 0;
    await updateIcon('idle');
  }

  // Delete all data
  const sessions = await listSessions();
  for (const session of sessions) {
    await removeSession(session.id);
  }

  sendResponse({ success: true });
}

/**
 * Handles CHECK_SENSITIVE_DOMAIN message.
 */
function handleCheckSensitiveDomain(
  url: string,
  sendResponse: (response: unknown) => void
): void {
  const isSensitive = isSensitiveDomain(url);
  sendResponse({ success: true, data: isSensitive });
}

/**
 * Loads session configuration from storage.
 */
async function loadSessionConfig(): Promise<SessionConfig> {
  const captureScrollEvents = await getConfig<boolean>('captureScrollEvents') ?? DEFAULT_SESSION_CONFIG.captureScrollEvents;
  const debounceMs = await getConfig<number>('debounceMs') ?? DEFAULT_SESSION_CONFIG.debounceMs;
  const maxEventsPerMinute = await getConfig<number>('maxEventsPerMinute') ?? DEFAULT_SESSION_CONFIG.maxEventsPerMinute;
  const customRules = await getConfig<typeof DEFAULT_REDACTION_RULES>('customRedactionRules') ?? [];
  const disabledDefaults = await getConfig<string[]>('disabledDefaultRules') ?? [];

  // Load export settings
  const maxInitialHTMLSize = await getConfig<number>('maxInitialHTMLSize') ?? DEFAULT_EXPORT_CONFIG.maxInitialHTMLSize;
  const diffMode = await getConfig<'line' | 'element'>('diffMode') ?? DEFAULT_EXPORT_CONFIG.diffMode;
  const includeParentContext = await getConfig<boolean>('includeParentContext') ?? DEFAULT_EXPORT_CONFIG.includeParentContext;

  // Combine default and custom rules, respecting disabled state
  const redactionRules = [
    ...DEFAULT_REDACTION_RULES.map(rule => ({
      ...rule,
      enabled: rule.enabled && !disabledDefaults.includes(rule.id),
    })),
    ...customRules,
  ];

  return {
    redactionRules,
    captureScrollEvents,
    captureMouseMovement: false,
    debounceMs,
    maxEventsPerMinute,
    exportConfig: {
      maxInitialHTMLSize,
      diffMode,
      includeParentContext,
    },
  };
}

/**
 * Updates the extension icon based on recording state.
 */
async function updateIcon(state: 'idle' | 'recording'): Promise<void> {
  const iconPath = state === 'recording'
    ? {
        16: 'icons/icon16.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      }
    : {
        16: 'icons/icon16.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      };

  await chrome.action.setIcon({ path: iconPath });

  // Set badge for recording state
  if (state === 'recording') {
    await chrome.action.setBadgeText({ text: 'REC' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Starts the auto-stop check interval.
 */
function startAutoStopCheck(): void {
  autoStopInterval = setInterval(async () => {
    if (checkAutoStop()) {
      console.log('[DOM Chronicle] Auto-stopping due to time limit');
      await handleStopRecording(() => {});
    }
  }, 60000); // Check every minute
}

/**
 * Stops the auto-stop check interval.
 */
function stopAutoStopCheck(): void {
  if (autoStopInterval) {
    clearInterval(autoStopInterval);
    autoStopInterval = null;
  }
}

/**
 * Handle tab close - stop recording if active tab is closed.
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === activeTabId) {
    console.log('[DOM Chronicle] Active tab closed, stopping recording');
    await stopSession();
    activeTabId = null;
    eventCount = 0;
    await updateIcon('idle');
    stopAutoStopCheck();
  }
});

/**
 * Handle tab navigation - stop recording if URL changes significantly.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeTabId) return;
  if (!changeInfo.url) return;

  const currentSession = getCurrentSession();
  if (!currentSession) return;

  // Check if domain changed
  try {
    const oldUrl = new URL(currentSession.url);
    const newUrl = new URL(changeInfo.url);

    if (oldUrl.hostname !== newUrl.hostname) {
      console.log('[DOM Chronicle] Domain changed, stopping recording');
      await handleStopRecording(() => {});
    }
  } catch {
    // Invalid URL, ignore
  }
});

/**
 * Handle extension install/update.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[DOM Chronicle] Extension installed/updated:', details.reason);

  // Initialize database
  await initialize();

  // Open options page on first install
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

/**
 * Handle service worker startup.
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[DOM Chronicle] Browser started');
  await initialize();
});

// Initialize immediately
initialize();
