// IndexedDB vault storage — blob v2 JSON string under db 'passwordmanager',
// store 'vault', key 'main'. All failures propagate as typed StorageError;
// there are no silent catches.

export type StorageErrorCode = 'READ' | 'WRITE' | 'CLEAR' | 'UNAVAILABLE'

export class StorageError extends Error {
  readonly code: StorageErrorCode
  readonly cause?: unknown

  constructor(code: StorageErrorCode, cause?: unknown) {
    super(`vault storage ${code} failed`)
    this.name = 'StorageError'
    this.code = code
    this.cause = cause
  }
}

const DB = 'passwordmanager'
const STORE = 'vault'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB, 1)
    } catch (err) {
      reject(new StorageError('UNAVAILABLE', err))
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new StorageError('UNAVAILABLE', req.error))
    req.onblocked = () => reject(new StorageError('UNAVAILABLE', new Error('open blocked')))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  code: StorageErrorCode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  let db: IDBDatabase
  try {
    db = await openDB()
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(code, err)
  }
  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const st = tx.objectStore(STORE)
    const req = fn(st)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new StorageError(code, req.error))
    tx.onabort = () => reject(new StorageError(code, tx.error))
    tx.onerror = () => reject(new StorageError(code, tx.error))
  })
}

// Returns null when no vault exists (not an error).
export async function getVault(): Promise<string | null> {
  const result = await withStore('readonly', 'READ', (store) => store.get('main'))
  return (result as string | undefined) ?? null
}

export async function setVault(data: string): Promise<void> {
  await withStore('readwrite', 'WRITE', (store) => store.put(data, 'main'))
}

export async function clearVault(): Promise<void> {
  await withStore('readwrite', 'CLEAR', (store) => store.delete('main'))
}