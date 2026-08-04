import { useEffect, useReducer, useRef, useState } from 'react'
import { Linkedin } from 'lucide-react'
import { createVault, unlockVault, saveVault, isVaultBlobV2, resetSession, getSessionSalt } from './crypto'
import type { Entry, VaultBlobV2 } from './crypto'
import { getVault, setVault, clearVault } from './storage'
import { tr } from './lib/i18n'
import type { Locale } from './lib/i18n'
import Header from './components/Header'
import Welcome from './components/Welcome'
import LockScreen from './components/LockScreen'
import Manager from './components/Manager'

// --- session state machine (discriminated union) ---

type AppState =
  | { status: 'checking' }
  | { status: 'setup'; legacy: boolean; error?: string }
  | { status: 'locked'; error?: string }
  | { status: 'unlocked'; busy: boolean; entries: Entry[]; error?: string }

type UnlockReason = 'WRONG_PASSWORD' | 'CORRUPT_VAULT'

type Action =
  | { type: 'BOOT'; hasVault: boolean; legacy: boolean }
  | { type: 'SETUP_CREATED' }
  | { type: 'UNLOCK_START' }
  | { type: 'UNLOCK_OK'; entries: Entry[] }
  | { type: 'UNLOCK_FAIL'; reason: UnlockReason }
  | { type: 'LOCK' }
  | { type: 'CLEARED_OK' }
  | { type: 'ENTRY_ADDED'; entry: Entry }
  | { type: 'ENTRY_DELETED'; id: string }
  | { type: 'STORAGE_ERROR'; message: string }

// Pure reducer — no crypto, no side effects. Key wiping happens in handlers.
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'BOOT':
      if (action.legacy) return { status: 'setup', legacy: true }
      if (action.hasVault) return { status: 'locked' }
      return { status: 'setup', legacy: false }
    case 'SETUP_CREATED':
      return { status: 'unlocked', busy: false, entries: [] }
    case 'UNLOCK_START':
      if (state.status !== 'locked') return state
      return { status: 'unlocked', busy: true, entries: [] }
    case 'UNLOCK_OK':
      if (state.status !== 'unlocked') return state
      return { status: 'unlocked', busy: false, entries: action.entries }
    case 'UNLOCK_FAIL':
      if (state.status !== 'unlocked') return state
      return { status: 'locked', error: action.reason }
    case 'LOCK':
      return { status: 'locked' }
    case 'CLEARED_OK':
      return { status: 'setup', legacy: false }
    case 'ENTRY_ADDED':
      if (state.status !== 'unlocked') return state
      return { ...state, busy: false, entries: [action.entry, ...state.entries] }
    case 'ENTRY_DELETED':
      if (state.status !== 'unlocked') return state
      return { ...state, busy: false, entries: state.entries.filter((e) => e.id !== action.id) }
    case 'STORAGE_ERROR':
      switch (state.status) {
        case 'checking':
          return { status: 'locked', error: action.message }
        case 'setup':
          return { ...state, error: action.message }
        case 'locked':
          return { ...state, error: action.message }
        case 'unlocked':
          return { ...state, busy: false, error: action.message }
      }
  }
}

export default function App() {
  const [lang, setLang] = useState<Locale>('en')
  const txt = tr(lang)
  const toggleLang = () => setLang(l => (l === 'en' ? 'es' : 'en'))

  // A11y lang sync: keep <html lang> aligned with the active locale.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const [state, dispatch] = useReducer(reducer, { status: 'checking' })
  const [saving, setSaving] = useState(false)
  const savedRef = useRef<string>('')
  const statusRef = useRef<AppState['status']>('checking')
  statusRef.current = state.status

  // Narrowed aliases used across effects/handlers without union-discriminant issues.
  const sessionStatus = state.status
  const sessionEntries: Entry[] | null = state.status === 'unlocked' ? state.entries : null

  // Boot: read the vault once, no Welcome flash (start on 'checking').
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = await getVault()
        if (cancelled) return
        if (raw) {
          // v2 -> locked; anything else (legacy crypto-js / unknown) -> reset notice
          if (isVaultBlobV2(raw)) dispatch({ type: 'BOOT', hasVault: true, legacy: false })
          else dispatch({ type: 'BOOT', hasVault: false, legacy: true })
        } else {
          dispatch({ type: 'BOOT', hasVault: false, legacy: false })
        }
      } catch {
        if (!cancelled) dispatch({ type: 'STORAGE_ERROR', message: txt.storageError })
      }
    })()
    return () => { cancelled = true }
  }, [])

  const onCreate = async (pw: string) => {
    const t = pw.trim()
    try {
      const blob = await createVault(t, [])
      await setVault(JSON.stringify(blob))
      savedRef.current = JSON.stringify([])
      dispatch({ type: 'SETUP_CREATED' })
    } catch {
      dispatch({ type: 'STORAGE_ERROR', message: txt.storageError })
    }
  }

  const onUnlock = async (pw: string) => {
    const t = pw.trim()
    dispatch({ type: 'UNLOCK_START' })
    try {
      const raw = await getVault()
      if (!raw) { dispatch({ type: 'STORAGE_ERROR', message: txt.storageError }); return }
      if (!isVaultBlobV2(raw)) { dispatch({ type: 'UNLOCK_FAIL', reason: 'CORRUPT_VAULT' }); return }
      const blob = JSON.parse(raw) as VaultBlobV2
      const res = await unlockVault(blob, t)
      if (res.ok) {
        savedRef.current = JSON.stringify(res.entries)
        dispatch({ type: 'UNLOCK_OK', entries: res.entries })
      } else {
        dispatch({ type: 'UNLOCK_FAIL', reason: res.reason })
      }
    } catch {
      dispatch({ type: 'STORAGE_ERROR', message: txt.storageError })
    }
  }

  // Lock wipes entries + master copy + the module-scoped session key.
  const onLock = () => {
    resetSession()
    savedRef.current = ''
    dispatch({ type: 'LOCK' })
  }

  const onClear = async () => {
    try {
      await clearVault()
      resetSession()
      savedRef.current = ''
      dispatch({ type: 'CLEARED_OK' })
    } catch {
      dispatch({ type: 'STORAGE_ERROR', message: txt.storageError })
    }
  }

  const addEntry = (e: Omit<Entry, 'id'>) => dispatch({ type: 'ENTRY_ADDED', entry: { id: crypto.randomUUID(), ...e } })
  const deleteEntry = (id: string) => dispatch({ type: 'ENTRY_DELETED', id })

  // Persist entries whenever they change while unlocked. Reuses the session
  // key via saveVault(existingSalt) — no 600k PBKDF2 re-derivation per save.
  useEffect(() => {
    if (sessionStatus !== 'unlocked' || sessionEntries === null) return
    const snapshot = JSON.stringify(sessionEntries)
    if (snapshot === savedRef.current) return
    savedRef.current = snapshot
    let cancelled = false
    setSaving(true)
    ;(async () => {
      try {
        const blob = await saveVault('', sessionEntries, getSessionSalt() ?? undefined)
        await setVault(JSON.stringify(blob))
      } catch {
        if (!cancelled) dispatch({ type: 'STORAGE_ERROR', message: txt.storageError })
      } finally {
        if (!cancelled) setSaving(false)
      }
    })()
    return () => { cancelled = true }
  }, [sessionStatus, sessionEntries])

  // Auto-lock: 5 minutes idle (reset on pointerdown/keydown) + immediate lock
  // when the tab becomes hidden. Cleanup removes listeners/timer.
  useEffect(() => {
    let idleTimer: number | undefined
    const lock = () => {
      if (statusRef.current !== 'unlocked') return
      resetSession()
      savedRef.current = ''
      dispatch({ type: 'LOCK' })
    }
    const resetTimer = () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer)
      idleTimer = setTimeout(lock, 5 * 60_000)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (idleTimer !== undefined) clearTimeout(idleTimer)
        idleTimer = undefined
        lock()
      }
    }
    window.addEventListener('pointerdown', resetTimer)
    window.addEventListener('keydown', resetTimer)
    document.addEventListener('visibilitychange', onVisibility)
    resetTimer()
    return () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer)
      window.removeEventListener('pointerdown', resetTimer)
      window.removeEventListener('keydown', resetTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const unlockError = (code: string | undefined): string | undefined => {
    if (!code) return undefined
    if (code === 'WRONG_PASSWORD') return txt.wrongPassword
    if (code === 'CORRUPT_VAULT') return txt.corruptVault
    return code
  }

  const unlocked = state.status === 'unlocked' && !state.busy

  return (
    <div className="app">
      <Header unlocked={unlocked} onLock={onLock} onClear={onClear} txt={txt} toggleLang={toggleLang} />
      {state.status === 'checking' ? (
        <div className="checking" role="status">{txt.busy}</div>
      ) : state.status === 'setup' ? (
        <Welcome onCreate={onCreate} txt={txt} legacy={state.legacy} error={state.error} />
      ) : state.status === 'locked' ? (
        <LockScreen onUnlock={onUnlock} txt={txt} error={unlockError(state.error)} />
      ) : state.busy ? (
        <div className="content">
          <div className="card pending" role="status" aria-live="polite">{txt.busy}</div>
        </div>
      ) : (
        <Manager entries={state.entries} addEntry={addEntry} deleteEntry={deleteEntry} txt={txt} error={unlockError(state.error)} saving={saving} />
      )}
      <footer className="footer">
        <span>{txt.footerText}</span>
        <a className="icon-btn primary" href="https://www.linkedin.com/in/andy-bencomo-608741287" target="_blank" rel="noreferrer"><Linkedin size={18} /> LinkedIn</a>
      </footer>
    </div>
  )
}
