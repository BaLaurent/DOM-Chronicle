import { DB_NAME, DB_VERSION, STORES } from '../utils/constants';
import type { Session, DOMEvent } from '../types';

let dbInstance: IDBDatabase | null = null;

/**
 * Opens or returns the existing IndexedDB connection.
 */
export async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Sessions store
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const sessionsStore = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        sessionsStore.createIndex('startedAt', 'startedAt');
        sessionsStore.createIndex('url', 'url');
      }

      // Events store
      if (!db.objectStoreNames.contains(STORES.EVENTS)) {
        const eventsStore = db.createObjectStore(STORES.EVENTS, { keyPath: 'id' });
        eventsStore.createIndex('sessionId', 'sessionId');
        eventsStore.createIndex('timestamp', 'timestamp');
        eventsStore.createIndex('type', 'type');
        eventsStore.createIndex('session-sequence', ['sessionId', 'sequence']);
      }

      // Config store
      if (!db.objectStoreNames.contains(STORES.CONFIG)) {
        db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
      }
    };
  });
}

/**
 * Stores a batch of events efficiently.
 */
export async function storeEventsBatch(events: DOMEvent[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.EVENTS, 'readwrite');
  const store = tx.objectStore(STORES.EVENTS);

  for (const event of events) {
    store.add(event);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Creates a new session.
 */
export async function createSession(session: Session): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.SESSIONS, 'readwrite');
  const store = tx.objectStore(STORES.SESSIONS);
  store.add(session);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Updates an existing session.
 */
export async function updateSession(session: Session): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.SESSIONS, 'readwrite');
  const store = tx.objectStore(STORES.SESSIONS);
  store.put(session);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Gets a session by ID.
 */
export async function getSession(sessionId: string): Promise<Session | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORES.SESSIONS, 'readonly');
  const store = tx.objectStore(STORES.SESSIONS);
  const request = store.get(sessionId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Gets all sessions, ordered by startedAt descending.
 */
export async function getAllSessions(): Promise<Session[]> {
  const db = await openDB();
  const tx = db.transaction(STORES.SESSIONS, 'readonly');
  const store = tx.objectStore(STORES.SESSIONS);
  const index = store.index('startedAt');
  const request = index.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const sessions = request.result as Session[];
      resolve(sessions.reverse()); // Most recent first
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Gets all events for a session, ordered by sequence.
 */
export async function getSessionEvents(sessionId: string): Promise<DOMEvent[]> {
  const db = await openDB();
  const tx = db.transaction(STORES.EVENTS, 'readonly');
  const store = tx.objectStore(STORES.EVENTS);
  const index = store.index('session-sequence');
  const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
  const request = index.getAll(range);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes a session and all its events.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDB();

  // Delete session
  const sessionTx = db.transaction(STORES.SESSIONS, 'readwrite');
  sessionTx.objectStore(STORES.SESSIONS).delete(sessionId);
  await new Promise<void>((resolve, reject) => {
    sessionTx.oncomplete = () => resolve();
    sessionTx.onerror = () => reject(sessionTx.error);
  });

  // Delete events
  const events = await getSessionEvents(sessionId);
  const eventTx = db.transaction(STORES.EVENTS, 'readwrite');
  const eventStore = eventTx.objectStore(STORES.EVENTS);
  for (const event of events) {
    eventStore.delete(event.id);
  }

  return new Promise((resolve, reject) => {
    eventTx.oncomplete = () => resolve();
    eventTx.onerror = () => reject(eventTx.error);
  });
}

/**
 * Gets event count for a session.
 */
export async function getEventCount(sessionId: string): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORES.EVENTS, 'readonly');
  const store = tx.objectStore(STORES.EVENTS);
  const index = store.index('sessionId');
  const request = index.count(sessionId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Stores or retrieves global config values.
 */
export async function getConfig<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORES.CONFIG, 'readonly');
  const store = tx.objectStore(STORES.CONFIG);
  const request = store.get(key);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

export async function setConfig<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.CONFIG, 'readwrite');
  const store = tx.objectStore(STORES.CONFIG);
  store.put({ key, value });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
