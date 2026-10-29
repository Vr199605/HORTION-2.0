import { createContext, useContext } from 'react'
import type { Store } from '../lib/types'

export interface AdminCtx {
  store: Store
  stores: Store[]
  reload: () => Promise<void>
  selectStore: (id: string) => void
}

export const AdminContext = createContext<AdminCtx | null>(null)

export function useAdmin(): AdminCtx {
  const c = useContext(AdminContext)
  if (!c) throw new Error('useAdmin fora do AdminLayout')
  return c
}

export const publicUrl = (slug: string) => `${window.location.origin}/${slug}`
