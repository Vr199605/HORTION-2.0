import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="center-screen">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  )
}

export function NotFound({ message = 'Página não encontrada' }: { message?: string }) {
  return (
    <div className="center-screen">
      <div style={{ fontSize: 48 }}>🥬</div>
      <h2>{message}</h2>
      <p>Confira o endereço ou fale com o hortifruti.</p>
      <Link className="btn primary" to="/">
        Ir para o início
      </Link>
    </div>
  )
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'err' | 'ok'; children: ReactNode }) {
  return <div className={`hint ${kind === 'info' ? '' : kind}`}>{children}</div>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
