// src/components/Manager.tsx
// Unlocked screen: add-entry form (Enter submits) plus the entry grid. Each
// entry is rendered by PasswordCard (which owns copy + delete-arm logic).
// `txt` is the typed i18n dict for the active locale (zero any).

import { useState } from 'react'
import { Plus, LogOut } from 'lucide-react'
import InlineError from './InlineError'
import PasswordCard from './PasswordCard'
import type { Entry } from '../crypto'
import type { Txt } from '../lib/i18n'

interface ManagerProps {
  entries: Entry[]
  addEntry: (e: Omit<Entry, 'id'>) => void
  deleteEntry: (id: string) => void
  txt: Txt
  error?: string
  saving?: boolean
}

export default function Manager({ entries, addEntry, deleteEntry, txt, error, saving }: ManagerProps) {
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
        <form className="form" onSubmit={(e) => { e.preventDefault(); onAdd() }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Plus size={18} />
            <strong>{txt.addNew}</strong>
            {saving ? <span className="hint" role="status" aria-live="polite">{txt.saving}</span> : null}
          </div>
          <InlineError msg={error} />
          <div className="row">
            <div className="field"><label htmlFor="site">{txt.website}</label><input className="input" id="site" value={site} onChange={e => setSite(e.target.value)} placeholder={txt.websitePh} /></div>
            <div className="field"><label htmlFor="username">{txt.username}</label><input className="input" id="username" value={username} onChange={e => setUsername(e.target.value)} placeholder={txt.usernamePh} /></div>
          </div>
          <div className="field"><label htmlFor="vault-password">{txt.password}</label><input className="input" id="vault-password" type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="icon-btn primary"><Plus size={18} /> {txt.add}</button>
            <button type="button" className="icon-btn" onClick={reset}><LogOut size={18} /> {txt.reset}</button>
          </div>
          <p className="hint">{txt.managerHint}</p>
        </form>
      </div>

      <div className="grid">
        {entries.map(e => (
          <PasswordCard key={e.id} entry={e} onDelete={() => deleteEntry(e.id)} txt={txt} />
        ))}
      </div>
    </div>
  )
}
