
// Local Call History Utility (IndexedDB)
const DB_NAME = 'maos_elite_history';
const STORE_NAME = 'calls';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCall(call: { callerId: string, direction: 'inbound' | 'outbound', disposition: string, duration?: number }) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add({
      ...call,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[HISTORY_ERR]', err);
  }
}

export async function getCallHistory(): Promise<any[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.reverse()); // Newest first
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[HISTORY_ERR]', err);
    return [];
  }
}
