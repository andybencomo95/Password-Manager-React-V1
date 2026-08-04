// src/App.test.tsx — behavioral tests over the real App (session-state,
// destructive-actions, a11y-foundations and i18n capabilities). Every flow
// runs through real Web Crypto + real fake-indexeddb persistence.

import { screen, waitFor } from '@testing-library/react'
import { getVault } from './storage'
import { getSessionKey, isVaultBlobV2 } from './crypto'
import type { VaultBlobV2 } from './crypto'
import {
  MASTER_PW,
  ENTRY,
  renderApp,
  seedVault,
  makeVaultBlob,
  resetTestState,
  unlock,
} from './test/helpers'

// PBKDF2 600k derivations make unlock/create take a few hundred ms; give the
// async finders a generous budget instead of the 1s default.
const SLOW = { timeout: 15_000 }

let blob: VaultBlobV2

beforeAll(async () => {
  blob = await makeVaultBlob([ENTRY])
})

beforeEach(async () => {
  await resetTestState()
})

describe('session-state', () => {
  it('starts on checking (no welcome flash) and settles on setup when no vault exists', async () => {
    renderApp()
    // First paint is the 'checking' status — the welcome screen must not flash.
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /create your master password/i })
    ).not.toBeInTheDocument()

    expect(
      await screen.findByRole('heading', { name: /create your master password/i }, SLOW)
    ).toBeInTheDocument()
  })

  it('setup flow creates a vault and lands on the manager', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: /create your master password/i }, SLOW)

    await user.type(screen.getByLabelText('Master password'), MASTER_PW)
    await user.type(screen.getByLabelText('Confirm master password'), MASTER_PW)
    await user.click(screen.getByRole('button', { name: /set master password/i }))

    expect(await screen.findByText('Add a new password', {}, SLOW)).toBeInTheDocument()
    await waitFor(async () => {
      const raw = await getVault()
      expect(raw).not.toBeNull()
      expect(isVaultBlobV2(raw ?? '')).toBe(true)
    })
  })

  it('boots to the locked screen when a vault exists', async () => {
    await seedVault(blob)
    renderApp()
    expect(
      await screen.findByRole('heading', { name: /vault locked/i }, SLOW)
    ).toBeInTheDocument()
  })

  it('lock wipes entries and the session key — entries only return via storage', async () => {
    await seedVault(blob)
    const { user } = renderApp()

    await screen.findByRole('heading', { name: /vault locked/i }, SLOW)
    await unlock(user, MASTER_PW)
    expect(await screen.findByText(ENTRY.site, {}, SLOW)).toBeInTheDocument()

    // Lock: UI returns to the locked screen, the entry list is gone and the
    // module-scoped key handle is wiped (S3 regression — no plaintext survival).
    await user.click(screen.getByRole('button', { name: /^lock$/i }))
    expect(screen.getByRole('heading', { name: /vault locked/i })).toBeInTheDocument()
    expect(screen.queryByText(ENTRY.site)).not.toBeInTheDocument()
    expect(getSessionKey()).toBeNull()

    // Re-unlock with the correct password: the entry comes back FROM STORAGE,
    // proving nothing survived in memory across the lock.
    await unlock(user, MASTER_PW)
    expect(await screen.findByText(ENTRY.site, {}, SLOW)).toBeInTheDocument()
  })

  it('shows an inline error for a wrong master password', async () => {
    await seedVault(blob)
    const { user } = renderApp()

    await screen.findByRole('heading', { name: /vault locked/i }, SLOW)
    await user.type(screen.getByLabelText('Enter master password'), 'WrongPass!1')
    await user.click(screen.getByRole('button', { name: /unlock/i }))

    expect(await screen.findByRole('alert', {}, SLOW)).toHaveTextContent(
      'Incorrect master password'
    )
  })
})

describe('destructive-actions', () => {
  it('delete requires a second click within the arm window (two-step confirm)', async () => {
    await seedVault(blob)
    const { user } = renderApp()

    await screen.findByRole('heading', { name: /vault locked/i }, SLOW)
    await unlock(user, MASTER_PW)
    await screen.findByText(ENTRY.site, {}, SLOW)

    const delBtn = await screen.findByRole('button', { name: /delete password/i }, SLOW)
    // First click arms only — the entry must survive.
    await user.click(delBtn)
    expect(delBtn).toHaveTextContent('Confirm?')
    expect(screen.getByText(ENTRY.site)).toBeInTheDocument()

    // Second click within the window executes the delete.
    await user.click(delBtn)
    await waitFor(() => expect(screen.queryByText(ENTRY.site)).not.toBeInTheDocument())
  })

  it('a single click never deletes — the first click only arms', async () => {
    await seedVault(blob)
    const { user } = renderApp()

    await screen.findByRole('heading', { name: /vault locked/i }, SLOW)
    await unlock(user, MASTER_PW)
    await screen.findByText(ENTRY.site, {}, SLOW)

    const delBtn = await screen.findByRole('button', { name: /delete password/i }, SLOW)
    await user.click(delBtn)
    // Still present — one click is never enough.
    expect(screen.getByText(ENTRY.site)).toBeInTheDocument()
    // The armed button reverts itself after 3s (auto-disarm).
    await waitFor(() => expect(delBtn).not.toHaveTextContent('Confirm?'), { timeout: 5_000 })
  })

  it('clear-all requires two clicks and lands on a coherent setup state', async () => {
    await seedVault(blob)
    const { user } = renderApp()

    await screen.findByRole('heading', { name: /vault locked/i }, SLOW)
    await unlock(user, MASTER_PW)
    await screen.findByText(ENTRY.site, {}, SLOW)

    const clearBtn = await screen.findByRole('button', { name: /clear all/i }, SLOW)
    // First click arms only.
    await user.click(clearBtn)
    expect(clearBtn).toHaveTextContent('Confirm?')
    expect(screen.getByText(ENTRY.site)).toBeInTheDocument()

    // Second click clears the vault and re-renders a fresh setup screen.
    await user.click(clearBtn)
    await waitFor(() => expect(screen.queryByText(ENTRY.site)).not.toBeInTheDocument())
    expect(
      await screen.findByRole('heading', { name: /create your master password/i }, SLOW)
    ).toBeInTheDocument()
    await waitFor(async () => expect(await getVault()).toBeNull())
  })
})

describe('a11y-foundations', () => {
  it('Enter submits the add-entry form (keyboard-only flow)', async () => {
    await seedVault(blob)
    const { user } = renderApp()

    await screen.findByRole('heading', { name: /vault locked/i }, SLOW)
    await unlock(user, MASTER_PW)
    await screen.findByText(ENTRY.site, {}, SLOW)

    await user.type(screen.getByLabelText('Website or service'), 'example.org')
    await user.type(screen.getByLabelText('Username'), 'alice')
    await user.type(screen.getByLabelText('Password'), 'pw-12345')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('example.org', {}, SLOW)).toBeInTheDocument()
  })

  it('Enter submits the unlock form', async () => {
    await seedVault(blob)
    const { user } = renderApp()

    await screen.findByRole('heading', { name: /vault locked/i }, SLOW)
    await user.type(screen.getByLabelText('Enter master password'), MASTER_PW)
    await user.keyboard('{Enter}')

    expect(await screen.findByText(ENTRY.site, {}, SLOW)).toBeInTheDocument()
  })

  it('language toggle updates UI strings and documentElement.lang', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: /create your master password/i }, SLOW)

    await user.click(screen.getByRole('button', { name: 'Español' }))
    await waitFor(() => expect(document.documentElement.lang).toBe('es'))
    expect(
      screen.getByRole('heading', { name: 'Crea tu contraseña maestra' })
    ).toBeInTheDocument()

    // Toggling back returns to English.
    await user.click(screen.getByRole('button', { name: 'English' }))
    await waitFor(() => expect(document.documentElement.lang).toBe('en'))
  })
})
