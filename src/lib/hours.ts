import type { DayKey, HoursMap, Store } from './types'

export const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: 'seg', label: 'Segunda', short: 'Seg' },
  { key: 'ter', label: 'Terça', short: 'Ter' },
  { key: 'qua', label: 'Quarta', short: 'Qua' },
  { key: 'qui', label: 'Quinta', short: 'Qui' },
  { key: 'sex', label: 'Sexta', short: 'Sex' },
  { key: 'sab', label: 'Sábado', short: 'Sáb' },
  { key: 'dom', label: 'Domingo', short: 'Dom' },
]

export const TZ = 'America/Sao_Paulo'

export function emptyHours(): HoursMap {
  return { seg: null, ter: null, qua: null, qui: null, sex: null, sab: null, dom: null }
}

export type HoursPreset = 'seg-sab' | 'todos' | '24h'

export function presetHours(kind: HoursPreset): HoursMap {
  const h = emptyHours()
  for (const d of DAYS) {
    if (kind === '24h') h[d.key] = { open: '00:00', close: '00:00' }
    else if (kind === 'todos') h[d.key] = { open: '07:00', close: '18:00' }
    else h[d.key] = d.key === 'dom' ? null : { open: '07:00', close: '18:00' }
  }
  return h
}

const WEEKDAY: Record<string, DayKey> = { Mon: 'seg', Tue: 'ter', Wed: 'qua', Thu: 'qui', Fri: 'sex', Sat: 'sab', Sun: 'dom' }

/** Dia da semana e minutos desde 00:00, no fuso de São Paulo (igual ao banco). */
export function saoPauloNow(date: Date = new Date()): { day: DayKey; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hour = Number(get('hour')) % 24
  const minute = Number(get('minute'))
  return { day: WEEKDAY[get('weekday')] ?? 'seg', minutes: hour * 60 + minute }
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m || 0)
}

/** Mesma regra da função store_is_open_now() do banco. */
export function isOpenAt(hours: HoursMap | null, date: Date = new Date()): boolean {
  if (!hours) return true // sem horário cadastrado = só vale o botão abrir/fechar
  const { day, minutes } = saoPauloNow(date)
  const d = hours[day]
  if (!d) return false
  const o = toMinutes(d.open)
  const c = toMinutes(d.close)
  if (c > o) return minutes >= o && minutes < c
  return minutes >= o || minutes < c // vira a meia-noite (00:00-00:00 = 24h)
}

export function isStoreOpen(store: Pick<Store, 'is_open' | 'hours_json'>, date: Date = new Date()): boolean {
  return store.is_open && isOpenAt(store.hours_json, date)
}

export function fmtTime(t: string): string {
  const [h, m] = t.split(':')
  const hh = String(Number(h))
  return Number(m) === 0 ? `${hh}h` : `${hh}h${m}`
}

export function dayLabel(d: { open: string; close: string } | null): string {
  if (!d) return 'Fechado'
  if (d.open === d.close) return '24 horas'
  return `${fmtTime(d.open)} às ${fmtTime(d.close)}`
}

export function hoursTable(hours: HoursMap | null): { label: string; value: string; today: boolean }[] {
  if (!hours) return []
  const today = saoPauloNow().day
  return DAYS.map((d) => ({ label: d.label, value: dayLabel(hours[d.key]), today: d.key === today }))
}

/** Texto curto para o topo: "Aberto · fecha às 18h" / "Fechado · abre amanhã às 7h" */
export function statusText(store: Pick<Store, 'is_open' | 'hours_json'>, date: Date = new Date()): string {
  if (!store.is_open) return 'Fechado no momento'
  const open = isOpenAt(store.hours_json, date)
  const h = store.hours_json
  const { day } = saoPauloNow(date)
  if (!h) return 'Aberto agora'
  if (open) {
    const d = h[day]
    return d && d.open !== d.close ? `Aberto agora · fecha às ${fmtTime(d.close)}` : 'Aberto agora'
  }
  const idx = DAYS.findIndex((x) => x.key === day)
  const { minutes } = saoPauloNow(date)
  const today = h[day]
  if (today && minutes < toMinutes(today.open)) return `Fechado · abre hoje às ${fmtTime(today.open)}`
  for (let i = 1; i <= 7; i++) {
    const nd = DAYS[(idx + i) % 7]
    const dh = h[nd.key]
    if (dh) return `Fechado · abre ${i === 1 ? 'amanhã' : nd.label.toLowerCase()} às ${fmtTime(dh.open)}`
  }
  return 'Fechado no momento'
}
