// src/test/helpers.ts — shared fixtures + render helpers for the B6 suite.
// Test-only support (excluded from the authored-code review budget).

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createVault, resetSession } from '../crypto'
import type { Entry, VaultBlobV2 } from '../crypto'
import { setVault } from '../storage'

export const MASTER_PW = 'Str0ng!Pass'
export const ENTRY: Entry = { id: 'e1', site: 'github.com', username: 'octocat', password: 'hunter2' }

export type User = ReturnType<typeof userEvent.setup>

// Clear the 'vault' store contents without deleting the DB. deleteDatabase is
// blocked by the open connections storage.ts intentionally keeps, so we open
// our own connection and clear the store instead.
export async function clearVaultStore(): Promise<void> {
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

// Per-test reset: wipe the module session key, clear the vault store, then
// flush stray microtasks and clear again so a late async setVault from the
// previous test cannot leak into the next one.
export async function resetTestState(): Promise<void> {
  resetSession()
  await clearVaultStore()
  await new Promise((r) => setTimeout(r, 0))
  await clearVaultStore()
}

export async function seedVault(blob: VaultBlobV2): Promise<void> {
  await setVault(JSON.stringify(blob))
}

export async function makeVaultBlob(entries: Entry[] = [ENTRY]): Promise<VaultBlobV2> {
  return createVault(MASTER_PW, entries)
}

export function renderApp() {
  const user = userEvent.setup()
  const view = render(<App />)
  return { user, ...view }
}

// Unlock the seeded vault from the locked screen (assumes LockScreen visible).
export async function unlock(user: User, pw: string): Promise<void> {
  await user.type(screen.getByLabelText('Enter master password'), pw)
  await user.click(screen.getByRole('button', { name: /unlock/i }))
}
