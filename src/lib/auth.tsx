import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from './supabase'

interface AuthState {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>({ session: null, loading: true, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isConfigured)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{ session, loading, signOut: async () => { await supabase.auth.signOut() } }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
