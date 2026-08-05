/**
 * Browser session persistence for the opened database, via IndexedDB.
 *
 * Because browsers can't write back to an arbitrary filesystem path, "staying
 * connected" across reloads means caching the last DB bytes locally. On reload
 * we can rehydrate the in-memory DB and keep editing exactly where you left off.
 */
const DB_NAME = 'bfrs-db-cache';
const STORE = 'blobs';
const KEY = 'current';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface CachedDb {
  bytes: Uint8Array;
  fileName: string;
  savedAt: string;
}

export async function cacheDb(bytes: Uint8Array, fileName: string): Promise<void> {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ bytes, fileName, savedAt: new Date().toISOString() }, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  idb.close();
}

export async function loadCachedDb(): Promise<CachedDb | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as CachedDb) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => idb.close();
  });
}

export async function clearCachedDb(): Promise<void> {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  idb.close();
}
