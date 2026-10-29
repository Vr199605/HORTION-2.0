import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const rpc = vi.fn()
const maybeSingle = vi.fn()
const authState = { session: null as any }

vi.mock('../lib/supabase', () => ({
  isConfigured: true,
  BRAND: 'HORTION',
  SALES_WHATSAPP: '',
  supabase: {
    rpc: (...a: any[]) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }) }),
    auth: { signUp: vi.fn(), signInWithPassword: vi.fn() },
  },
}))
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ session: authState.session, loading: false, signOut: vi.fn() }),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: () => Promise.resolve('data:image/png;base64,') } }))

import Builder from '../pages/Builder'

const setup = () =>
  render(
    <MemoryRouter>
      <Builder />
    </MemoryRouter>,
  )

beforeEach(() => {
  rpc.mockReset()
  maybeSingle.mockReset()
  maybeSingle.mockResolvedValue({ data: null })
  authState.session = null
})

describe('montador de loja', () => {
  it('bloqueia o passo 1 sem dados e mostra os erros', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /Continuar/ }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('nome da loja')
    expect(alert).toHaveTextContent('WhatsApp')
    expect(screen.getByRole('heading', { name: /Como se chama/ })).toBeInTheDocument()
  })

  it('gera o endereço do nome, recusa reservado e avisa endereço ocupado', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByLabelText('Nome da loja'), 'Horti do João')
    expect(screen.getByLabelText(/Endereço do catálogo/)).toHaveValue('horti-do-joao')
    expect(await screen.findByText(/Endereço disponível/)).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/Endereço do catálogo/))
    await user.type(screen.getByLabelText(/Endereço do catálogo/), 'montar')
    expect(await screen.findByText(/reservado/)).toBeInTheDocument()

    maybeSingle.mockResolvedValue({ data: { id: 'x' } })
    await user.clear(screen.getByLabelText(/Endereço do catálogo/))
    await user.type(screen.getByLabelText(/Endereço do catálogo/), 'ocupado')
    expect(await screen.findByText(/já está em uso/)).toBeInTheDocument()
  })

  it('percorre os 4 passos e publica só preços reais (exemplos ficam de fora)', async () => {
    const user = userEvent.setup()
    authState.session = { user: { email: 'dono@teste.com' } }
    rpc.mockResolvedValue({ data: { id: 'store-1' }, error: null })
    setup()

    await user.type(screen.getByLabelText('Nome da loja'), 'Horti Teste')
    await user.type(screen.getByLabelText(/WhatsApp que recebe/), '21987654321')
    await screen.findByText(/Endereço disponível/)
    await user.click(screen.getByRole('button', { name: /Continuar/ }))

    // passo 2: troca o preço de exemplo da Banana Prata por um preço real
    const banana = screen.getByLabelText('Preço de Banana Prata')
    expect(banana).toHaveValue('7,99')
    await user.clear(banana)
    await user.type(banana, '8,50')
    expect(screen.getByText(/com o seu preço/)).toHaveTextContent('1 com o seu preço')
    // produto próprio
    await user.type(screen.getByLabelText('Nome do novo produto'), 'Pitaya')
    await user.type(screen.getByLabelText('Preço do novo produto'), '12,90')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByLabelText('Preço de Pitaya')).toHaveValue('12,90')
    await user.click(screen.getByRole('button', { name: /Continuar/ }))

    // passo 3: valor inválido bloqueia
    await user.type(screen.getByLabelText(/Pedido mínimo/), 'abc')
    await user.click(screen.getByRole('button', { name: /Continuar/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Pedido mínimo')
    await user.clear(screen.getByLabelText(/Pedido mínimo/))
    await user.type(screen.getByLabelText(/Pedido mínimo/), '20')
    await user.type(screen.getByLabelText('Nome do bairro'), 'Centro')
    await user.type(screen.getByLabelText('Taxa do bairro'), '5')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    await user.click(screen.getByRole('button', { name: /Continuar/ }))

    // passo 4: aviso dos exemplos e publicação
    const summary = screen.getByRole('alert')
    expect(summary).toHaveTextContent(/preços de exemplo/)
    await user.click(screen.getByRole('button', { name: /Publicar minha loja/ }))

    expect(await screen.findByText(/está no ar/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('create_store_from_draft')
    expect(args).toMatchObject({ p_name: 'Horti Teste', p_slug: 'horti-teste', p_whatsapp: '(21) 98765-4321' })
    const draft = args.p_draft
    expect(draft.products.map((p: any) => p.name).sort()).toEqual(['Banana Prata', 'Pitaya'])
    expect(draft.products.find((p: any) => p.name === 'Banana Prata').price).toBe(8.5)
    expect(draft.min_order).toBe(20)
    expect(draft.zones).toEqual([{ name: 'Centro', fee: 5 }])
    expect(localStorage.getItem('hortion:draft')).toBeNull()
  })

  it('sem login mostra o cadastro em vez do botão de publicar', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByLabelText('Nome da loja'), 'Horti X')
    await user.type(screen.getByLabelText(/WhatsApp que recebe/), '21987654321')
    await screen.findByText(/Endereço disponível/)
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: /Continuar/ }))
    expect(screen.getByRole('heading', { name: /Crie sua conta para publicar/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Publicar minha loja/ })).toBeNull()
  })

  it('se o endereço for tomado na hora de publicar, volta ao passo 1 com o aviso', async () => {
    const user = userEvent.setup()
    authState.session = { user: { email: 'dono@teste.com' } }
    rpc.mockResolvedValue({ data: null, error: { message: 'Esse endereço já está em uso' } })
    setup()
    await user.type(screen.getByLabelText('Nome da loja'), 'Horti Y')
    await user.type(screen.getByLabelText(/WhatsApp que recebe/), '21987654321')
    await screen.findByText(/Endereço disponível/)
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: /Continuar/ }))
    await user.click(screen.getByRole('button', { name: /Publicar minha loja/ }))
    expect(await screen.findByRole('heading', { name: /Como se chama/ })).toBeInTheDocument()
    expect((await screen.findAllByText(/já está em uso/)).length).toBeGreaterThan(0)
    // o rascunho continua salvo
    expect(localStorage.getItem('hortion:draft')).not.toBeNull()
  })

  it('prévia ao vivo reflete o nome e permite testar um pedido', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByLabelText('Nome da loja'), 'Minha Quitanda')
    await user.click(screen.getByRole('button', { name: /Ver prévia/ }))
    const modal = screen.getByRole('dialog', { name: 'Prévia da loja' })
    expect(within(modal).getByRole('heading', { name: 'Minha Quitanda' })).toBeInTheDocument()
    await user.click(within(modal).getAllByRole('button', { name: /^Adicionar / })[0])
    expect(within(modal).getByRole('button', { name: /Ver carrinho/ })).toBeInTheDocument()
  })
})
