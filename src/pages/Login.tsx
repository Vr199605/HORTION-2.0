import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase, isConfigured, BRAND } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  const [mode, setMode] = useState<'login' | 'signup'>(loc.pathname === '/cadastro' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  if (!loading && session) return <Navigate to="/painel" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!isConfigured) return setMsg({ kind: 'err', text: 'Supabase não configurado. Veja o README (passo 2).' })
    if (password.length < 6) return setMsg({ kind: 'err', text: 'A senha precisa ter pelo menos 6 caracteres.' })
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) {
          setMsg({ kind: 'ok', text: 'Conta criada! Confirme o e-mail que enviamos e depois faça login.' })
          setMode('login')
        }
      }
    } catch (err: any) {
      const m = String(err.message || err)
      setMsg({
        kind: 'err',
        text: m.includes('Invalid login') ? 'E-mail ou senha incorretos.' : m.includes('already') ? 'Esse e-mail já tem conta. Faça login.' : m,
      })
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    if (!email) return setMsg({ kind: 'err', text: 'Digite seu e-mail primeiro.' })
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/painel` })
    setMsg(error ? { kind: 'err', text: error.message } : { kind: 'ok', text: 'Enviamos um link para redefinir a senha.' })
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <Link to="/" className="auth-brand">🥬 {BRAND}</Link>
        <h2>{mode === 'login' ? 'Entrar no painel' : 'Criar minha conta'}</h2>
        <label className="field">
          <span>E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {msg && <div className={`hint ${msg.kind}`}>{msg.text}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
        {mode === 'login' && (
          <button type="button" className="link-btn" onClick={forgot}>Esqueci minha senha</button>
        )}
        <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(null) }}>
          {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  )
}
