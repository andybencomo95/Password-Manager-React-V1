// src/components/InlineError.tsx
// Shared inline error line. Rendered as live-region content so screen readers
// announce it; styled by the existing .form-error class. Returns null when
// there is no message so callers can render it unconditionally.
export default function InlineError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <p role="alert" className="form-error">{msg}</p>
  )
}