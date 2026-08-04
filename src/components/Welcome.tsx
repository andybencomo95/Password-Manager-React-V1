// src/components/Welcome.tsx
// Setup screen: creates the master password with live requirement checks.
// Requirement labels come from the typed i18n dict (txt.reqLabels — zero any).

import { useState } from 'react'
import { ShieldCheck, Unlock, Eye, EyeOff } from 'lucide-react'
import InlineError from './InlineError'
import type { Txt } from '../lib/i18n'

const logo = new URL('../../logo.svg', import.meta.url).href

interface WelcomeProps {
  onCreate: (password: string) => void
  txt: Txt
  legacy?: boolean
  error?: string
}

export default function Welcome({ onCreate, txt, legacy, error }: WelcomeProps) {
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
        <form className="form" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <h2>{txt.createMaster}</h2>
          <p className="hint">{txt.securityHint} <ShieldCheck size={14} style={{ marginLeft: 6 }} /></p>
          {legacy ? <p className="hint legacy-notice">{txt.legacyNotice}</p> : null}
          <InlineError msg={error} />
          <div className="field">
            <label htmlFor="master-password">{txt.masterLabel}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" id="master-password" type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="Min 8 characters" />
              <button type="button" className="icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? txt.hidePassword : txt.revealPassword}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="confirm-password">{txt.confirmLabel}</label>
            <input className="input" id="confirm-password" type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} />
          </div>
          {(p1.length > 0 || p2.length > 0) && (
            <div className="requirements">
              <div className={`req ${minLen ? 'ok' : ''}`}><span className="dot" /> <span className="text">{txt.reqLabels.len}</span></div>
              <div className={`req ${match ? 'ok' : ''}`}><span className="dot" /> <span className="text">{txt.reqLabels.match}</span></div>
              <div className={`req ${hasUpper ? 'ok' : ''}`}><span className="dot" /> <span className="text">{txt.reqLabels.upper}</span></div>
              <div className={`req ${hasLower ? 'ok' : ''}`}><span className="dot" /> <span className="text">{txt.reqLabels.lower}</span></div>
              <div className={`req ${hasDigit ? 'ok' : ''}`}><span className="dot" /> <span className="text">{txt.reqLabels.digit}</span></div>
              <div className={`req ${hasSymbol ? 'ok' : ''}`}><span className="dot" /> <span className="text">{txt.reqLabels.symbol}</span></div>
          </div>
        )}
        <button type="submit" className="icon-btn primary" disabled={!valid}>
            <Unlock size={18} /> {txt.setMaster}
          </button>
        </form>
      </div>
    </div>
  )
}
