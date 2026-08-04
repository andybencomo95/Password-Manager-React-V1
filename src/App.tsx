import { useEffect, useReducer, useRef, useState } from 'react'
import { Lock, Unlock, Plus, Trash2, Copy, Eye, EyeOff, LogOut, ShieldCheck, Globe, Linkedin } from 'lucide-react'
import { createVault, unlockVault, saveVault, isVaultBlobV2, resetSession, getSessionSalt } from './crypto'
import type { Entry, VaultBlobV2 } from './crypto'
import { getVault, setVault, clearVault } from './storage'
import { writeClipboard } from './lib/clipboard'
import InlineError from './components/InlineError'

const logo = new URL('../logo.svg', import.meta.url).href

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

function Header({ unlocked, onLock, onClear, txt, toggleLang }: { unlocked: boolean; onLock: () => void; onClear: () => void; txt: any; toggleLang: () => void }) {
  const [confirmingClear, setConfirmingClear] = useState(false)
  const clearTimer = useRef<number | null>(null)
  const clearBtnRef = useRef<HTMLButtonElement | null>(null)

  const disarmClear = () => {
    if (clearTimer.current !== null) { window.clearTimeout(clearTimer.current); clearTimer.current = null }
    setConfirmingClear(false)
  }

  const handleClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true)
      clearTimer.current = window.setTimeout(disarmClear, 3000)
      return
    }
    disarmClear()
    onClear()
  }

  // Auto-revert when the user interacts elsewhere (misclick guard).
  useEffect(() => {
    if (!confirmingClear) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (clearBtnRef.current && !clearBtnRef.current.contains(t)) disarmClear()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [confirmingClear])

  useEffect(() => () => { if (clearTimer.current !== null) window.clearTimeout(clearTimer.current) }, [])

  return (
    <header className="header">
      <img src={logo} alt="Logo" style={{ width: 28, height: 28, borderRadius: 6 }} />
      <h1>{txt.title}</h1>
      <span className="spacer" />
      <div className="toolbar">
        {unlocked ? (
          <button className="icon-btn" onClick={onLock} title="Lock">
            <Lock size={18} /> {txt.lock}
          </button>
        ) : null}
        {unlocked ? (
          <button ref={clearBtnRef} className="icon-btn danger" onClick={handleClear} title={txt.clearAll} aria-label={txt.clearAll}>
            <Trash2 size={18} /> {confirmingClear ? txt.confirmClearAll : txt.clearAll}
          </button>
        ) : null}
        <button className="icon-btn" onClick={toggleLang} title="Language">
          <Globe size={18} /> {txt.langTo}
        </button>
      </div>
    </header>
  )
}

function Welcome({ onCreate, txt, reqLabels, legacy, error }: { onCreate: (password: string) => void; txt: any; reqLabels: { len: string; match: string; upper: string; lower: string; digit: string; symbol: string }; legacy?: boolean; error?: string }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const p1 = pw.trim()
  const p2 = pw2.trim()
  const hasUpper = /[A-Z]/.test(p1)
  const hasLower = /[a-z]/.test(p1)
  const hasDigit = /\d/.test(p1)
  const hasSymbol = /[^A-Za-z0-9]/.test(p1)
  const minLen = p1.length >= 8
  const match = p1 === p2
  const valid = minLen && match
  const submit = () => { if (valid) onCreate(p1) }
  return (
    <div className="welcome">
      <img src={logo} alt="Logo" />
      <div className="card">
        <div className="form">
          <h2>{txt.createMaster}</h2>
          <p className="hint">{txt.securityHint} <ShieldCheck size={14} style={{ marginLeft: 6 }} /></p>
          {legacy ? <p className="hint legacy-notice">{txt.legacyNotice}</p> : null}
          <InlineError msg={error} />
          <div className="field">
            <label>{txt.masterLabel}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="Min 8 characters" />
              <button className="icon-btn" onClick={() => setShow(s => !s)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          <div className="field">
            <label>{txt.confirmLabel}</label>
            <input className="input" type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} />
          </div>
          {(p1.length > 0 || p2.length > 0) && (
            <div className="requirements">
              <div className={`req ${minLen ? 'ok' : ''}`}><span className="dot" /> <span className="text">{reqLabels.len}</span></div>
              <div className={`req ${match ? 'ok' : ''}`}><span className="dot" /> <span className="text">{reqLabels.match}</span></div>
              <div className={`req ${hasUpper ? 'ok' : ''}`}><span className="dot" /> <span className="text">{reqLabels.upper}</span></div>
              <div className={`req ${hasLower ? 'ok' : ''}`}><span className="dot" /> <span className="text">{reqLabels.lower}</span></div>
              <div className={`req ${hasDigit ? 'ok' : ''}`}><span className="dot" /> <span className="text">{reqLabels.digit}</span></div>
              <div className={`req ${hasSymbol ? 'ok' : ''}`}><span className="dot" /> <span className="text">{reqLabels.symbol}</span></div>
          </div>
        )}
        <button className="icon-btn primary" disabled={!valid} onClick={submit}>
            <Unlock size={18} /> {txt.setMaster}
          </button>
        </div>
      </div>
    </div>
  )
}

function LockScreen({ onUnlock, txt, error }: { onUnlock: (password: string) => void; txt: any; error?: string }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  return (
    <div className="locked">
      <h2>{txt.vaultLocked}</h2>
      <div className="card">
        <div className="form">
          <InlineError msg={error} />
          <div className="field">
            <label>{txt.enterMaster}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} />
              <button className="icon-btn" onClick={() => setShow(s => !s)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          <button className="icon-btn primary" onClick={() => onUnlock(pw)}>
            <Unlock size={18} /> {txt.unlock}
          </button>
        </div>
      </div>
      <p className="hint">{txt.lockHint}</p>
    </div>
  )
}

function PasswordCard({ entry, onCopy, onDelete, txt }: { entry: Entry; onCopy: (text: string) => Promise<void>; onDelete: () => void; txt: any }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | undefined>()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const copyTimer = useRef<number | null>(null)
  const armTimer = useRef<number | null>(null)
  const deleteBtnRef = useRef<HTMLButtonElement | null>(null)

  const disarmDelete = () => {
    if (armTimer.current !== null) { window.clearTimeout(armTimer.current); armTimer.current = null }
    setConfirmingDelete(false)
  }

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      armTimer.current = window.setTimeout(disarmDelete, 3000)
      return
    }
    disarmDelete()
    onDelete()
  }

  // Auto-revert when the user interacts elsewhere (misclick guard).
  useEffect(() => {
    if (!confirmingDelete) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (deleteBtnRef.current && !deleteBtnRef.current.contains(t)) disarmDelete()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [confirmingDelete])

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    if (armTimer.current !== null) window.clearTimeout(armTimer.current)
  }, [])

  const handleCopy = async () => {
    setCopyError(undefined)
    try {
      await onCopy(entry.password)
      setCopied(true)
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(txt.clipboardError)
    }
  }

  return (
    <div className="card">
      <div className="entry">
        <div className="badge" aria-label="Site icon">
          <Unlock size={20} color="var(--accent)" />
        </div>
        <div className="meta">
          <div className="title">{entry.site}</div>
          <div className="subtitle">{entry.username}</div>
        </div>
        <div className="actions">
          <button className="icon-btn" onClick={() => setRevealed(r => !r)} aria-label={revealed ? txt.hidePassword : txt.revealPassword}>{revealed ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          <button className="icon-btn" onClick={handleCopy} aria-label={txt.copyPassword}><Copy size={18} /></button>
          <button ref={deleteBtnRef} className="icon-btn danger" onClick={handleDelete} aria-label={txt.deletePassword}>{confirmingDelete ? <span>{txt.confirmDelete}</span> : <Trash2 size={18} />}</button>
        </div>
      </div>
      <div className="meta-slot" aria-live="polite">
        {copied ? <span className="hint copied">{txt.copied}</span> : null}
        <InlineError msg={copyError} />
      </div>
      {revealed && (
        <div style={{ marginTop: 12 }}>
          <div className="pill">{entry.password}</div>
        </div>
      )}
    </div>
  )
}

function Manager({ entries, addEntry, deleteEntry, txt, error, saving }: { entries: Entry[]; addEntry: (e: Omit<Entry, 'id'>) => void; deleteEntry: (id: string) => void; txt: any; error?: string; saving?: boolean }) {
  const [site, setSite] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const reset = () => { setSite(''); setUsername(''); setPassword('') }

  const onAdd = () => {
    if (!site || !username || !password) return
    addEntry({ site, username, password })
    reset()
  }

  return (
    <div className="content">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Plus size={18} />
            <strong>{txt.addNew}</strong>
            {saving ? <span className="hint" role="status" aria-live="polite">{txt.saving}</span> : null}
          </div>
          <InlineError msg={error} />
          <div className="row">
            <div className="field"><label>{txt.website}</label><input className="input" value={site} onChange={e => setSite(e.target.value)} placeholder={txt.websitePh} /></div>
            <div className="field"><label>{txt.username}</label><input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder={txt.usernamePh} /></div>
          </div>
          <div className="field"><label>{txt.password}</label><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="icon-btn primary" onClick={onAdd}><Plus size={18} /> {txt.add}</button>
            <button type="button" className="icon-btn" onClick={reset}><LogOut size={18} /> {txt.reset}</button>
          </div>
          <p className="hint">{txt.managerHint}</p>
        </div>
      </div>

      <div className="grid">
        {entries.map(e => (
          <PasswordCard key={e.id} entry={e} onCopy={writeClipboard} onDelete={() => deleteEntry(e.id)} txt={txt} />
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const [lang, setLang] = useState<'en' | 'es'>('en')
  const TXT = {
    en: {
      title: 'Password Manager',
      lock: 'Lock',
      clearAll: 'Clear all',
      createMaster: 'Create your master password',
      securityHint: 'Passwords are encrypted (PBKDF2 + AES-256-GCM) and stored locally in IndexedDB; the encryption key derives from your master password and is kept in memory only while unlocked.',
      masterLabel: 'Master password',
      confirmLabel: 'Confirm master password',
      setMaster: 'Set master password',
      vaultLocked: 'Vault locked',
      enterMaster: 'Enter master password',
      unlock: 'Unlock',
      lockHint: 'Enter your master password to unlock your encrypted vault.',
      addNew: 'Add a new password',
      website: 'Website or service',
      websitePh: 'e.g., github.com',
      username: 'Username',
      usernamePh: 'john@example.com',
      password: 'Password',
      add: 'Add',
      reset: 'Reset',
      managerHint: 'Changes are saved encrypted locally. Lock clears the key from memory.',
      langTo: 'Español',
      footerText: 'Project created by:',
      legacyNotice: 'A legacy vault was detected. Creating a new vault here will replace it and reset all stored passwords.',
      wrongPassword: 'Incorrect master password',
      corruptVault: 'Vault is corrupted',
      storageError: 'Unable to access local storage',
      busy: 'Unlocking…',
      saving: 'Saving…',
      copied: 'Copied ✓',
      copyPassword: 'Copy password',
      deletePassword: 'Delete password',
      confirmDelete: 'Confirm?',
      confirmClearAll: 'Confirm?',
      clipboardError: 'Unable to copy',
      revealPassword: 'Reveal password',
      hidePassword: 'Hide password'
    },
    es: {
      title: 'Gestor de Contraseñas',
      lock: 'Bloquear',
      clearAll: 'Borrar todo',
      createMaster: 'Crea tu contraseña maestra',
      securityHint: 'Las contraseñas se cifran (PBKDF2 + AES-256-GCM) y se almacenan localmente en IndexedDB; la clave de cifrado se deriva de tu contraseña maestra y permanece en memoria solo mientras el gestor está desbloqueado.',
      masterLabel: 'Contraseña maestra',
      confirmLabel: 'Confirmar contraseña maestra',
      setMaster: 'Establecer contraseña maestra',
      vaultLocked: 'Bóveda bloqueada',
      enterMaster: 'Introduce la contraseña maestra',
      unlock: 'Desbloquear',
      lockHint: 'Introduce tu contraseña maestra para desbloquear la bóveda cifrada.',
      addNew: 'Añadir nueva contraseña',
      website: 'Sitio o servicio',
      websitePh: 'ej., github.com',
      username: 'Usuario',
      usernamePh: 'juan@ejemplo.com',
      password: 'Contraseña',
      add: 'Añadir',
      reset: 'Reiniciar',
      managerHint: 'Los cambios se guardan cifrados localmente. Bloquear borra la clave de memoria.',
      langTo: 'English',
      footerText: 'Proyecto creado por:',
      legacyNotice: 'Se detectó una bóveda antigua. Crear una nueva bóveda aquí la reemplazará y restablecerá todas las contraseñas guardadas.',
      wrongPassword: 'Contraseña maestra incorrecta',
      corruptVault: 'La bóveda está dañada',
      storageError: 'No se pudo acceder al almacenamiento local',
      busy: 'Desbloqueando…',
      saving: 'Guardando…',
      copied: '¡Copiado! ✓',
      copyPassword: 'Copiar contraseña',
      deletePassword: 'Eliminar contraseña',
      confirmDelete: '¿Confirmar?',
      confirmClearAll: '¿Confirmar?',
      clipboardError: 'No se pudo copiar',
      revealPassword: 'Mostrar contraseña',
      hidePassword: 'Ocultar contraseña'
    }
  } as const
  const txt = TXT[lang]
  const reqLabels = lang === 'es'
    ? { len: 'Al menos 8 caracteres', match: 'La contraseña y la confirmación coinciden', upper: 'Incluye una mayúscula', lower: 'Incluye una minúscula', digit: 'Incluye un número', symbol: 'Incluye un símbolo' }
    : { len: 'At least 8 characters', match: 'Password and confirmation match', upper: 'Include an uppercase letter', lower: 'Include a lowercase letter', digit: 'Include a number', symbol: 'Include a symbol' }
  const toggleLang = () => setLang(l => (l === 'en' ? 'es' : 'en'))

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
        <Welcome onCreate={onCreate} txt={txt} reqLabels={reqLabels} legacy={state.legacy} error={state.error} />
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