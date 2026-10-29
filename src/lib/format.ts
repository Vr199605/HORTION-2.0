export const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const onlyDigits = (s: string) => (s || '').replace(/\D/g, '')

/** Aceita "7,99", "7.99", "R$ 7,99" e devolve número */
export function parseMoney(input: string): number {
  const cleaned = (input || '').replace(/[^\d,.-]/g, '')
  if (!cleaned) return NaN
  const normalized =
    cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function formatPhone(digits: string): string {
  const d = onlyDigits(digits).replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return digits
}

export function qtyLabel(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Cor de texto legível sobre a cor primária */
export function onColor(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#111827' : '#ffffff'
}

/** Sem acento e minúsculo, para busca */
export function normalizeText(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Máscara de telefone enquanto digita: (21) 98765-4321 */
export function maskPhone(input: string): string {
  const d = onlyDigits(input).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const r2 = (n: number) => Math.round(n * 100) / 100
