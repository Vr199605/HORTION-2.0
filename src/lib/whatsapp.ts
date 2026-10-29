import { brl, qtyLabel } from './format'
import { UNIT_SHORT } from './types'
import type { OrderResult, Store, Unit } from './types'

export interface CustomerInfo {
  name: string
  phone: string
  delivery_type: 'delivery' | 'pickup'
  address: string
  neighborhood: string
  zone_id: string
  payment_method: string
  notes: string
  coupon: string
}

export function buildOrderMessage(store: Store, order: OrderResult, c: CustomerInfo): string {
  const lines: string[] = []
  lines.push(`*NOVO PEDIDO ${order.code}* 🥬`)
  lines.push('')
  for (const it of order.items) {
    const unit = it.unit === 'un' ? '' : ` ${UNIT_SHORT[it.unit as Unit] ?? it.unit}`
    lines.push(`• ${qtyLabel(it.qty)}${unit} ${it.name} — ${brl(it.line_total)}${it.note ? ` (${it.note})` : ''}`)
  }
  lines.push('')
  lines.push(`Subtotal: ${brl(order.subtotal)}`)
  if (order.discount > 0) lines.push(`Cupom ${order.coupon_code ?? ''}: -${brl(order.discount)}`)
  if (c.delivery_type === 'delivery') lines.push(`Entrega: ${order.delivery_fee > 0 ? brl(order.delivery_fee) : 'Grátis'}`)
  lines.push(`*Total: ${brl(order.total)}*`)
  lines.push('')
  lines.push(`Cliente: ${c.name}`)
  if (c.phone) lines.push(`Telefone: ${c.phone}`)
  if (c.delivery_type === 'delivery') {
    lines.push(`Entrega em: ${c.address}${c.neighborhood ? ` — ${c.neighborhood}` : ''}`)
  } else {
    lines.push('Retirada na loja')
  }
  if (c.payment_method) lines.push(`Pagamento: ${c.payment_method}`)
  if (c.notes) lines.push(`Obs.: ${c.notes}`)
  return lines.join('\n')
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}
