import { SALES_WHATSAPP } from './supabase'

/**
 * Planos e preços exibidos na página de vendas e no painel.
 * Edite aqui: é o único lugar onde os valores aparecem.
 */
export const TRIAL_DAYS = 14

export interface Plan {
  id: 'mensal' | 'anual' | 'local'
  name: string
  tag?: string
  original?: number
  price: number
  period: string
  installments: string
  features: string[]
}

/** Taxa opcional de implantação (você monta a loja para o cliente). Cobrada à parte. */
export const SETUP_FEE_NOTE = 'Quer que a gente monte tudo para você? Implantação opcional a partir de R$ 150.'

const BASE_FEATURES = [
  'Catálogo ilimitado com foto, preço e oferta',
  'Carrinho e pedido organizado no WhatsApp',
  '⚡ Atualização Express de preços',
  'Cupons de desconto e boxes',
  'Taxa por bairro e horário por dia',
  'QR Code e link para Google e Instagram',
  'Painel de pedidos em tempo real',
  'Sem comissão por pedido',
]

export const PLANS: Plan[] = [
  {
    id: 'mensal',
    name: 'HORTION Mensal',
    price: 89,
    period: 'por mês',
    installments: 'Cancele quando quiser, sem multa',
    features: BASE_FEATURES,
  },
  {
    id: 'anual',
    name: 'HORTION Anual',
    tag: 'Melhor custo-benefício',
    original: 1068,
    price: 797,
    period: 'por ano',
    installments: 'ou 12x de R$ 66,42 no cartão (equivale a R$ 66/mês)',
    features: ['Tudo do plano Mensal', 'Economia de 25% no ano', 'Treinamento inicial'],
  },
  {
    id: 'local',
    name: 'HORTION Divulgação Local',
    original: 2494,
    price: 1397,
    period: 'pagamento único · 12 meses',
    installments: 'ou 12x de R$ 116,42 no cartão',
    features: ['Tudo do HORTION Anual', '5.000 panfletos 10×14 cm com QR Code', 'Arte exclusiva e acompanhamento da gráfica'],
  },
]

export const hasSalesContact = Boolean(SALES_WHATSAPP)

export function salesLink(message: string): string {
  return SALES_WHATSAPP ? `https://wa.me/${SALES_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(message)}` : '#'
}

export function activationMessage(storeName: string, slug: string, planName?: string): string {
  return `Olá! Quero ativar o HORTION na minha loja "${storeName}" (${slug})${planName ? `, plano ${planName}` : ''}.`
}
