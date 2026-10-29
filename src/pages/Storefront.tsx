import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { loadCatalog } from '../lib/api'
import type { CatalogData } from '../lib/types'
import { Spinner, NotFound } from '../components/Common'
import ShopView from '../components/ShopView'

export default function Storefront() {
  const { slug = '' } = useParams()
  const [data, setData] = useState<CatalogData | null | undefined>(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setData(undefined)
    setError('')
    loadCatalog(slug)
      .then((d) => live && setData(d))
      .catch((e) => {
        if (!live) return
        setError(e.message)
        setData(null)
      })
    return () => {
      live = false
    }
  }, [slug])

  useEffect(() => {
    if (!data) return
    document.title = `${data.store.name} | Faça seu pedido`
    const meta = document.querySelector('meta[name="theme-color"]')
    const prev = meta?.getAttribute('content')
    meta?.setAttribute('content', data.store.primary_color)
    return () => {
      if (prev) meta?.setAttribute('content', prev)
    }
  }, [data])

  if (data === undefined) return <Spinner />
  if (data === null) return <NotFound message={error || 'Loja não encontrada'} />
  return <ShopView data={data} />
}
