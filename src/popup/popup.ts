import type { Session, RecordingState, MessageResponse } from '../lib/types';

// DOM Elements
const statusIndicator = document.getElementById('status-indicator')!;
const statusDot = statusIndicator.querySelector('.status-dot')!;
const statusText = statusIndicator.querySelector('.status-text')!;
const currentInfo = document.getElementById('current-info')!;
const durationEl = document.getElementById('duration')!;
const eventCountEl = document.getElementById('event-count')!;
const btnRecord = document.getElementById('btn-record')! as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop')! as HTMLButtonElement;
const warningBanner = document.getElementById('warning-banner')!;
const sessionsList = document.getElementById('sessions-list')!;
const linkOptions = document.getElementById('link-options')!;

// State
let currentState: RecordingState = 'idle';
let currentSession: Session | null = null;
let durationInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Sends a message to the background script.
 */
async function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response.success) {
        resolve(response.data as T);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

/**
 * Updates the UI based on recording state.
 */
function updateUI(state: RecordingState, session?: Session | null): void {
  currentState = state;
  currentSession = session || null;

  // Update status indicator
  statusDot.className = 'status-dot ' + state;
  statusText.textContent = state === 'recording' ? 'Recording' : state === 'paused' ? 'Paused' : 'Idle';

  // Update buttons
  btnRecord.hidden = state === 'recording';
  btnStop.hidden = state !== 'recording';

  // Update current info
  if (state === 'recording' && currentSession) {
    currentInfo.hidden = false;
    updateDuration();
    startDurationTimer();
  } else {
    currentInfo.hidden = true;
    stopDurationTimer();
  }
}

/**
 * Updates the duration display.
 */
function updateDuration(): void {
  if (!currentSession) return;

  const elapsed = Date.now() - currentSession.startedAt;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    durationEl.textContent = `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  } else {
    durationEl.textContent = `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
}

/**
 * Starts the duration timer.
 */
function startDurationTimer(): void {
  stopDurationTimer();
  durationInterval = setInterval(updateDuration, 1000);
}

/**
 * Stops the duration timer.
 */
function stopDurationTimer(): void {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
}

/**
 * Updates the event count display.
 */
function updateEventCount(count: number): void {
  eventCountEl.textContent = count.toString();
}

/**
 * Starts recording.
 */
async function startRecording(): Promise<void> {
  try {
    btnRecord.disabled = true;
    btnRecord.textContent = 'Starting...';

    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url) {
      throw new Error('No active tab');
    }

    // Check for sensitive domain
    const isSensitive = await sendMessage<boolean>({ type: 'CHECK_SENSITIVE_DOMAIN', url: tab.url });
    if (isSensitive) {
      warningBanner.hidden = false;
    }

    // Start recording
    const session = await sendMessage<Session>({ type: 'START_RECORDING' });

    updateUI('recording', session);
  } catch (error) {
    console.error('Failed to start recording:', error);
    alert('Failed to start recording: ' + (error as Error).message);
  } finally {
    btnRecord.disabled = false;
    btnRecord.innerHTML = '<span class="btn-icon">●</span> Start Recording';
  }
}

/**
 * Stops recording.
 */
async function stopRecording(): Promise<void> {
  try {
    btnStop.disabled = true;
    btnStop.textContent = 'Stopping...';

    await sendMessage({ type: 'STOP_RECORDING' });

    updateUI('idle', null);
    warningBanner.hidden = true;

    // Refresh sessions list
    await loadSessions();
  } catch (error) {
    console.error('Failed to stop recording:', error);
    alert('Failed to stop recording: ' + (error as Error).message);
  } finally {
    btnStop.disabled = false;
    btnStop.innerHTML = '<span class="btn-icon">■</span> Stop Recording';
  }
}

/**
 * Loads and displays sessions list.
 */
async function loadSessions(): Promise<void> {
  try {
    const sessions = await sendMessage<Session[]>({ type: 'GET_SESSIONS' });

    if (!sessions || sessions.length === 0) {
      sessionsList.innerHTML = '<p class="empty-state">No sessions recorded yet.</p>';
      return;
    }

    // Show last 5 sessions
    const recentSessions = sessions.slice(0, 5);

    sessionsList.innerHTML = recentSessions
      .map((session) => renderSessionItem(session))
      .join('');

    // Attach event listeners
    sessionsList.querySelectorAll('.session-item').forEach((item) => {
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
    sessionsList.innerHTML = '<p class="empty-state error">Failed to load sessions.</p>';
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
        <div class="session-title">${escapeHtml(truncate(session.title, 30))}</div>
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
 * Exports a session to Markdown.
 */
async function exportSession(sessionId: string): Promise<void> {
  try {
    const markdown = await sendMessage<string>({ type: 'EXPORT_SESSION', sessionId });

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dom-chronicle-${sessionId.substring(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export session:', error);
    alert('Failed to export session: ' + (error as Error).message);
  }
}

/**
 * Deletes a session.
 */
async function deleteSession(sessionId: string): Promise<void> {
  if (!confirm('Delete this recording? This cannot be undone.')) {
    return;
  }

  try {
    await sendMessage({ type: 'DELETE_SESSION', sessionId });
    await loadSessions();
  } catch (error) {
    console.error('Failed to delete session:', error);
    alert('Failed to delete session: ' + (error as Error).message);
  }
}

/**
 * Gets current recording status.
 */
async function getStatus(): Promise<void> {
  try {
    const status = await sendMessage<{ state: RecordingState; session: Session | null; eventCount: number }>({
      type: 'GET_STATUS',
    });

    updateUI(status.state, status.session);
    if (status.eventCount !== undefined) {
      updateEventCount(status.eventCount);
    }
  } catch (error) {
    console.error('Failed to get status:', error);
  }
}

// Helper functions
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.substring(0, len - 1) + '…' : str;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Event listeners
btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
linkOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Listen for event count updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'EVENT_COUNT_UPDATE') {
    updateEventCount(message.count);
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await getStatus();
  await loadSessions();
});
