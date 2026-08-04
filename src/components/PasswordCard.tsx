// src/components/PasswordCard.tsx
// One vault entry card: reveal/hide, copy with transient "Copied ✓" (aria-live)
// and inline clipboard errors, and a two-step delete (3s auto-revert +
// misclick/Escape guard). The copy flow lives here (writeClipboard imported
// directly per design). `txt` is the typed i18n dict (zero any).

import { useEffect, useRef, useState } from 'react'
import { Unlock, Copy, Trash2, Eye, EyeOff } from 'lucide-react'
import InlineError from './InlineError'
import { writeClipboard } from '../lib/clipboard'
import type { Entry } from '../crypto'
import type { Txt } from '../lib/i18n'

interface PasswordCardProps {
  entry: Entry
  onDelete: () => void
  txt: Txt
}

export default function PasswordCard({ entry, onDelete, txt }: PasswordCardProps) {
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

  // Auto-revert when the user interacts elsewhere or presses Escape (misclick
  // guard + keyboard cancel for the two-step confirm).
  useEffect(() => {
    if (!confirmingDelete) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (deleteBtnRef.current && !deleteBtnRef.current.contains(t)) disarmDelete()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') disarmDelete()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [confirmingDelete])

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    if (armTimer.current !== null) window.clearTimeout(armTimer.current)
  }, [])

  const handleCopy = async () => {
    setCopyError(undefined)
    try {
      await writeClipboard(entry.password)
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
