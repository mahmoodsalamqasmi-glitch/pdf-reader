const LOCAL_PREFIX = "husainireader";
const DB_NAME = "husainireader-db";
const DB_VERSION = 1;
const FILE_STORE = "files";

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(`${LOCAL_PREFIX}:${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  localStorage.setItem(`${LOCAL_PREFIX}:${key}`, JSON.stringify(value));
}

export function docIdFor(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE, mode);
    const store = transaction.objectStore(FILE_STORE);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function persistFile(file) {
  const id = docIdFor(file);
  await withStore("readwrite", (store) => store.put({
    id,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    blob: file,
    openedAt: Date.now()
  }));
  return id;
}

export async function getStoredFile(id) {
  return withStore("readonly", (store) => store.get(id));
}

export async function getRecentFiles() {
  const rows = await withStore("readonly", (store) => store.getAll());
  return rows.sort((a, b) => b.openedAt - a.openedAt).slice(0, 10);
}

export async function removeStoredFile(id) {
  await withStore("readwrite", (store) => store.delete(id));
}
