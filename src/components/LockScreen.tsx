// src/components/LockScreen.tsx
// Locked screen: unlock form with show/hide toggle. `txt` is the typed i18n
// dict for the active locale (zero any).

import { useState } from 'react'
import { Unlock, Eye, EyeOff } from 'lucide-react'
import InlineError from './InlineError'
import type { Txt } from '../lib/i18n'

interface LockScreenProps {
  onUnlock: (password: string) => void
  txt: Txt
  error?: string
}

export default function LockScreen({ onUnlock, txt, error }: LockScreenProps) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  return (
    <div className="locked">
      <h2>{txt.vaultLocked}</h2>
      <div className="card">
        <form className="form" onSubmit={(e) => { e.preventDefault(); onUnlock(pw) }}>
          <InlineError msg={error} />
          <div className="field">
            <label htmlFor="unlock-password">{txt.enterMaster}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" id="unlock-password" type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} />
              <button type="button" className="icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? txt.hidePassword : txt.revealPassword}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          <button type="submit" className="icon-btn primary">
            <Unlock size={18} /> {txt.unlock}
          </button>
        </form>
      </div>
      <p className="hint">{txt.lockHint}</p>
    </div>
  )
}
