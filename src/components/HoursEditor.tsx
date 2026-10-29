import { DAYS, presetHours, emptyHours } from '../lib/hours'
import type { HoursPreset } from '../lib/hours'
import type { DayKey, HoursMap } from '../lib/types'

/** Editor de horário por dia da semana. value=null significa "sem horário definido" (vale só o botão abrir/fechar). */
export default function HoursEditor({ value, onChange }: { value: HoursMap | null; onChange: (v: HoursMap | null) => void }) {
  const hours = value ?? emptyHours()

  const set = (k: DayKey, patch: Partial<{ open: string; close: string }> | null) => {
    const cur = hours[k]
    const next: HoursMap = { ...hours }
    next[k] = patch === null ? null : { open: cur?.open ?? '07:00', close: cur?.close ?? '18:00', ...patch }
    onChange(next)
  }

  const preset = (p: HoursPreset) => onChange(presetHours(p))

  return (
    <div className="hours-editor">
      <div className="row wrap">
        <button type="button" className="btn small ghost" onClick={() => preset('seg-sab')}>Seg a Sáb · 7h–18h</button>
        <button type="button" className="btn small ghost" onClick={() => preset('todos')}>Todos os dias · 7h–18h</button>
        <button type="button" className="btn small ghost" onClick={() => preset('24h')}>24 horas</button>
        {value && (
          <button type="button" className="btn small ghost" onClick={() => onChange(null)}>Sem horário fixo</button>
        )}
      </div>
      {!value && <p className="muted small">Sem horário fixo: a loja fica aberta sempre que o botão “Loja aberta” estiver ligado.</p>}
      {value && (
        <div className="hours-grid">
          {DAYS.map((d) => {
            const h = hours[d.key]
            const is24 = h && h.open === h.close
            return (
              <div key={d.key} className="hours-row">
                <label className="check hours-day">
                  <input
                    type="checkbox"
                    aria-label={`${d.label} aberto`}
                    checked={Boolean(h)}
                    onChange={(e) => set(d.key, e.target.checked ? {} : null)}
                  />
                  {d.label}
                </label>
                {h ? (
                  is24 ? (
                    <span className="muted small grow">24 horas</span>
                  ) : (
                    <span className="hours-times grow">
                      <input type="time" aria-label={`${d.label} abre`} value={h.open} onChange={(e) => set(d.key, { open: e.target.value || '07:00' })} />
                      <span>às</span>
                      <input type="time" aria-label={`${d.label} fecha`} value={h.close} onChange={(e) => set(d.key, { close: e.target.value || '18:00' })} />
                    </span>
                  )
                ) : (
                  <span className="muted small grow">Fechado</span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!value && (
        <button type="button" className="btn small ghost" onClick={() => preset('seg-sab')}>Definir horários por dia</button>
      )}
    </div>
  )
}
