import {
  parseStoredProjectFreeBoardEnvelope,
  type ProjectFreeBoardMutationEnvelope,
} from "@/lib/projects/project-free-board-queue";

const DATABASE_NAME = "wowstorg-client-recovery";
const STORE_NAME = "project-workspace-v1";

function fallbackKey(key: string) {
  return `wowstorg:recovery:${key}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  });
}

export async function readProjectBoardRecovery(
  key: string,
): Promise<ProjectFreeBoardMutationEnvelope | null> {
  try {
    const database = await openDatabase();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Recovery read failed"));
    });
    database.close();
    return parseStoredProjectFreeBoardEnvelope(typeof raw === "string" ? raw : null);
  } catch {
    try {
      return parseStoredProjectFreeBoardEnvelope(localStorage.getItem(fallbackKey(key)));
    } catch {
      return null;
    }
  }
}

export async function writeProjectBoardRecovery(
  key: string,
  envelope: ProjectFreeBoardMutationEnvelope | null,
) {
  const raw = envelope ? JSON.stringify(envelope) : null;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      if (raw) store.put(raw, key);
      else store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Recovery write failed"));
    });
    database.close();
    try {
      localStorage.removeItem(fallbackKey(key));
    } catch {
      // IndexedDB already contains the durable copy.
    }
  } catch {
    try {
      if (raw) localStorage.setItem(fallbackKey(key), raw);
      else localStorage.removeItem(fallbackKey(key));
    } catch {
      // The pending mutation remains in memory and the UI keeps its warning.
    }
  }
}
