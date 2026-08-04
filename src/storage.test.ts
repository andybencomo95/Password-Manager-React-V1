// src/storage.test.ts — vault storage over fake-indexeddb: round-trip, missing
// key semantics and typed error propagation (no silent failures).

import { getVault, setVault, clearVault, StorageError } from './storage'

// Minimal fake shapes so we can inject IDB failures (fake-indexeddb itself
// never fails on its own) without real IndexedDB and without `any`.
interface FakeReq {
  result?: unknown
  error?: unknown
  onerror?: ((e: Event) => void) | null
  onsuccess?: ((e: Event) => void) | null
}

interface FakeStore {
  get: () => FakeReq
  put: () => FakeReq
  delete: () => FakeReq
}

interface FakeIDB {
  open: () => FakeReq
}

function failingRequest(error: unknown): FakeReq {
  const req: FakeReq = { error }
  setTimeout(() => req.onerror?.(new Event('error')), 0)
  return req
}

// An indexedDB whose open succeeds but whose store operations fail — used to
// prove READ/WRITE/CLEAR errors surface as StorageError with the right code.
function makeErroringIDB(failOp: 'get' | 'put' | 'delete'): FakeIDB {
  const ok: () => FakeReq = () => ({})
  const fail = () => failingRequest(new DOMException('QuotaExceededError'))
  const store: FakeStore = {
    get: failOp === 'get' ? fail : ok,
    put: failOp === 'put' ? fail : ok,
    delete: failOp === 'delete' ? fail : ok,
  }
  return {
    open() {
      const req: FakeReq = {}
      setTimeout(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          transaction: () => ({ objectStore: () => store }),
        }
        req.onsuccess?.(new Event('success'))
      }, 0)
      return req
    },
  }
}

// Clear the 'vault' store between tests (deleteDatabase is blocked by the
// open connections storage.ts keeps, so clear the store on our own connection).
async function clearVaultStore(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('passwordmanager', 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('vault')) req.result.createObjectStore('vault')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('vault', 'readwrite')
      tx.objectStore('vault').clear()
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
    req.onerror = () => reject(req.error)
  })
}

beforeEach(async () => {
  await clearVaultStore()
})

describe('vault storage (fake-indexeddb)', () => {
  it('persists a blob and reads it back from key "main"', async () => {
    const blob = JSON.stringify({ version: 2, ciphertext: 'x' })
    await setVault(blob)
    expect(await getVault()).toBe(blob)
  })

  it('returns null when no vault is stored (not an error)', async () => {
    expect(await getVault()).toBeNull()
  })

  it('clearVault removes the stored blob', async () => {
    await setVault('data')
    await clearVault()
    expect(await getVault()).toBeNull()
  })

  it('clearVault is a no-op when nothing is stored', async () => {
    await clearVault()
    expect(await getVault()).toBeNull()
  })
})

describe('error propagation', () => {
  it('wraps a read failure in StorageError READ', async () => {
    vi.stubGlobal('indexedDB', makeErroringIDB('get') as unknown as IDBFactory)
    await expect(getVault()).rejects.toMatchObject({ name: 'StorageError', code: 'READ' })
    vi.unstubAllGlobals()
  })

  it('wraps a write failure in StorageError WRITE', async () => {
    vi.stubGlobal('indexedDB', makeErroringIDB('put') as unknown as IDBFactory)
    await expect(setVault('data')).rejects.toMatchObject({ name: 'StorageError', code: 'WRITE' })
    vi.unstubAllGlobals()
  })

  it('wraps a clear failure in StorageError CLEAR', async () => {
    vi.stubGlobal('indexedDB', makeErroringIDB('delete') as unknown as IDBFactory)
    await expect(clearVault()).rejects.toMatchObject({ name: 'StorageError', code: 'CLEAR' })
    vi.unstubAllGlobals()
  })

  it('wraps an unavailable IndexedDB in StorageError UNAVAILABLE', async () => {
    vi.stubGlobal(
      'indexedDB',
      { open: () => { throw new Error('denied') } } as unknown as IDBFactory
    )
    await expect(getVault()).rejects.toMatchObject({ name: 'StorageError', code: 'UNAVAILABLE' })
    vi.unstubAllGlobals()
  })

  it('exposes the code on the error instance', async () => {
    const err = new StorageError('WRITE', new Error('boom'))
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('WRITE')
    expect(err.message).toContain('WRITE')
  })
})
