/**
 * Rule-set snapshots - a lightweight, client-side "version control" for routing
 * rules.
 *
 * A snapshot captures the canvas-projected rules (and the provider metadata)
 * at a point in time so the user can diff against them later or roll back.
 * Snapshots are stored per database file in IndexedDB; no server required.
 */
import type { ProviderConfig, RoutingRule } from '@/types/bifrost';

const DB_NAME = 'bfrs-snapshots';
const STORE = 'snapshots';
const VERSION = 1;

export interface RuleSnapshot {
  id: string;
  label: string;
  createdAt: string;
  rules: RoutingRule[];
  providers: ProviderConfig[];
  ruleCount: number;
}

interface SnapshotRecord extends RuleSnapshot {
  key: string; // `${fileName}::${id}`
  fileName: string;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keyOf(fileName: string, id: string): string {
  return fileName + '::' + id;
}

export async function saveSnapshot(
  fileName: string,
  snapshot: Omit<RuleSnapshot, 'key' | 'fileName' | 'ruleCount' | 'id'> & { id?: string },
): Promise<RuleSnapshot> {
  const id =
    snapshot.id ?? 'snap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const record: SnapshotRecord = {
    ...snapshot,
    id,
    key: keyOf(fileName, id),
    fileName,
    ruleCount: snapshot.rules.length,
  };
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  idb.close();
  const { key: _k, fileName: _f, ...rest } = record;
  return rest;
}

export async function listSnapshots(fileName: string): Promise<RuleSnapshot[]> {
  const idb = await openIdb();
  const records = await new Promise<SnapshotRecord[]>((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as SnapshotRecord[]);
    req.onerror = () => reject(req.error);
  });
  idb.close();
  return records
    .filter((r) => r.fileName === fileName)
    .map(({ key: _k, fileName: _f, ...rest }) => rest)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSnapshot(fileName: string, id: string): Promise<RuleSnapshot | null> {
  const idb = await openIdb();
  const record = await new Promise<SnapshotRecord | undefined>((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(keyOf(fileName, id));
    req.onsuccess = () => resolve(req.result as SnapshotRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  idb.close();
  if (!record) return null;
  const { key: _k, fileName: _f, ...rest } = record;
  return rest;
}

export async function deleteSnapshot(fileName: string, id: string): Promise<void> {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(keyOf(fileName, id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  idb.close();
}
