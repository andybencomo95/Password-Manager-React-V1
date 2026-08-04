// src/components/Header.tsx
// App header: lock button, two-step clear-all (3s auto-revert + misclick/Escape
// guard) and the language toggle. `txt` is the typed i18n dict for the active
// locale (Txt derived from the en baseline — zero any).

import { useEffect, useRef, useState } from 'react'
import { Lock, Trash2, Globe } from 'lucide-react'
import type { Txt } from '../lib/i18n'

const logo = new URL('../../logo.svg', import.meta.url).href

interface HeaderProps {
  unlocked: boolean
  onLock: () => void
  onClear: () => void
  toggleLang: () => void
  txt: Txt
}

export default function Header({ unlocked, onLock, onClear, txt, toggleLang }: HeaderProps) {
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

  // Auto-revert when the user interacts elsewhere or presses Escape (misclick
  // guard + keyboard cancel for the two-step confirm).
  useEffect(() => {
    if (!confirmingClear) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (clearBtnRef.current && !clearBtnRef.current.contains(t)) disarmClear()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') disarmClear()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [confirmingClear])

  useEffect(() => () => { if (clearTimer.current !== null) window.clearTimeout(clearTimer.current) }, [])

  return (
    <header className="header">
      <img src={logo} alt="Logo" style={{ width: 28, height: 28, borderRadius: 6 }} />
      <h1>{txt.title}</h1>
      <span className="spacer" />
      <div className="toolbar">
        {unlocked ? (
          <button className="icon-btn" onClick={onLock} title={txt.lock} aria-label={txt.lock}>
            <Lock size={18} /> {txt.lock}
          </button>
        ) : null}
        {unlocked ? (
          <button ref={clearBtnRef} className="icon-btn danger" onClick={handleClear} title={txt.clearAll} aria-label={txt.clearAll}>
            <Trash2 size={18} /> {confirmingClear ? txt.confirmClearAll : txt.clearAll}
          </button>
        ) : null}
        <button className="icon-btn" onClick={toggleLang} title={txt.langTo} aria-label={txt.langTo}>
          <Globe size={18} /> {txt.langTo}
        </button>
      </div>
    </header>
  )
}
