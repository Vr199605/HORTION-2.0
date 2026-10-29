import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Box, Category, Product, Zone } from '../lib/types'
import { useAdmin } from './context'

export function useCatalog() {
  const { store } = useAdmin()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [boxes, setBoxes] = useState<Box[]>([])
  const [zones, setZones] = useState<Zone[]>([])

  const refresh = useCallback(async () => {
    setError('')
    const [c, p, b, z] = await Promise.all([
      supabase.from('categories').select('*').eq('store_id', store.id).order('sort'),
      supabase.from('products').select('*').eq('store_id', store.id).order('sort').order('name'),
      supabase.from('boxes').select('*').eq('store_id', store.id).order('sort'),
      supabase.from('delivery_zones').select('*').eq('store_id', store.id).order('sort').order('name'),
    ])
    const err = c.error || p.error || b.error || z.error
    if (err) setError(err.message)
    setCategories(c.data ?? [])
    setProducts((p.data ?? []).map((x: any) => ({ ...x, price: Number(x.price), offer_price: x.offer_price === null ? null : Number(x.offer_price), featured: Boolean(x.featured) })))
    setBoxes((b.data ?? []).map((x: any) => ({ ...x, price: Number(x.price) })))
    setZones((z.data ?? []).map((x: any) => ({ ...x, fee: Number(x.fee) })))
    setLoading(false)
  }, [store.id])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  return { loading, error, categories, products, boxes, zones, refresh }
}
