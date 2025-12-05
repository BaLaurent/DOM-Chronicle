import type { Session, SessionConfig, DOMEvent, RecordingState } from '../types';
import { DEFAULT_SESSION_CONFIG, LIMITS } from '../utils/constants';
import {
  createSession,
  updateSession,
  getSession,
  getAllSessions,
  deleteSession,
  storeEventsBatch,
  getSessionEvents,
  getEventCount,
} from './indexeddb';

let currentSession: Session | null = null;
let recordingState: RecordingState = 'idle';

/**
 * Starts a new recording session.
 */
export async function startSession(
  url: string,
  title: string,
  config?: Partial<SessionConfig>
): Promise<Session> {
  if (currentSession) {
    throw new Error('A session is already active');
  }

  const session: Session = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    url,
    title,
    config: {
      ...DEFAULT_SESSION_CONFIG,
      redactionRules: [],
      ...config,
    },
    eventCount: 0,
  };

  await createSession(session);
  currentSession = session;
  recordingState = 'recording';

  return session;
}

/**
 * Stops the current recording session.
 */
export async function stopSession(): Promise<Session | null> {
  if (!currentSession) return null;

  const eventCount = await getEventCount(currentSession.id);
  currentSession.endedAt = Date.now();
  currentSession.eventCount = eventCount;

  await updateSession(currentSession);

  const session = currentSession;
  currentSession = null;
  recordingState = 'idle';

  return session;
}

/**
 * Gets the current active session.
 */
export function getCurrentSession(): Session | null {
  return currentSession;
}

/**
 * Gets the current recording state.
 */
export function getRecordingState(): RecordingState {
  return recordingState;
}

/**
 * Stores events for the current session.
 */
export async function storeEvents(events: DOMEvent[]): Promise<void> {
  if (!currentSession) {
    throw new Error('No active session');
  }

  // Check session limits
  const currentCount = await getEventCount(currentSession.id);
  if (currentCount + events.length > LIMITS.MAX_EVENTS_PER_SESSION) {
    console.warn('Session event limit reached, stopping recording');
    await stopSession();
    return;
  }

  await storeEventsBatch(events);
}

/**
 * Gets all stored sessions.
 */
export async function listSessions(): Promise<Session[]> {
  return getAllSessions();
}

/**
 * Gets a specific session by ID.
 */
export async function getSessionById(id: string): Promise<Session | undefined> {
  return getSession(id);
}

/**
 * Gets all events for a session.
 */
export async function getEventsForSession(sessionId: string): Promise<DOMEvent[]> {
  return getSessionEvents(sessionId);
}

/**
 * Deletes a session and all its events.
 */
export async function removeSession(sessionId: string): Promise<void> {
  if (currentSession?.id === sessionId) {
    throw new Error('Cannot delete active session');
  }
  return deleteSession(sessionId);
}

/**
 * Checks if recording should auto-stop due to time limit.
 */
export function checkAutoStop(): boolean {
  if (!currentSession) return false;

  const elapsed = Date.now() - currentSession.startedAt;
  const maxDuration = LIMITS.SESSION_AUTO_STOP_HOURS * 60 * 60 * 1000;

  return elapsed >= maxDuration;
}

/**
 * Restores session state from storage (for service worker restart).
 */
export async function restoreState(): Promise<void> {
  // Check for any unclosed sessions
  const sessions = await getAllSessions();
  const unclosed = sessions.find((s) => !s.endedAt);

  if (unclosed) {
    // Session was interrupted, mark it as ended
    unclosed.endedAt = Date.now();
    unclosed.eventCount = await getEventCount(unclosed.id);
    await updateSession(unclosed);
  }

  currentSession = null;
  recordingState = 'idle';
}
