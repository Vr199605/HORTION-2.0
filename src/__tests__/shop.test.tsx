import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/supabase', () => ({
  isConfigured: false,
  BRAND: 'HORTION',
  SALES_WHATSAPP: '',
  supabase: {},
}))

import ShopView from '../components/ShopView'
import { DEMOS } from '../lib/demoData'

const renderShop = () =>
  render(
    <MemoryRouter>
      <ShopView data={DEMOS.demo} />
    </MemoryRouter>,
  )

describe('vitrine (loja demonstração)', () => {
  it('mostra destaques, categorias com "Ver todos" e busca sem acento', async () => {
    const user = userEvent.setup()
    renderShop()
    expect(screen.getByRole('heading', { name: /Destaques/ })).toBeInTheDocument()
    expect(screen.getAllByText(/Ver todos/).length).toBeGreaterThan(2)
    await user.type(screen.getByLabelText('Buscar produtos'), 'maca')
    expect(await screen.findByText(/Resultados para/)).toBeInTheDocument()
    expect(screen.getAllByText(/Maçã/).length).toBeGreaterThan(0)
    await user.clear(screen.getByLabelText('Buscar produtos'))
    await user.type(screen.getByLabelText('Buscar produtos'), 'zzzz')
    expect(await screen.findByText('Nenhum produto encontrado.')).toBeInTheDocument()
  })

  it('"Ver todos" abre a categoria inteira', async () => {
    const user = userEvent.setup()
    renderShop()
    await user.click(screen.getAllByText(/Ver todos/)[0])
    // a visão de uma só seção não tem mais linhas horizontais
    expect(document.querySelector('.hrow')).toBeNull()
    expect(document.querySelector('.grid')).not.toBeNull()
  })

  it('fluxo completo: carrinho, cupom, checkout e pedido', async () => {
    const user = userEvent.setup()
    renderShop()

    const addButtons = screen.getAllByRole('button', { name: /^Adicionar / })
    await user.click(addButtons[0])
    // barra do carrinho aparece
    const bar = await screen.findByRole('button', { name: /Ver carrinho/ })
    await user.click(bar)
    const dialog = screen.getByRole('dialog', { name: 'Carrinho' })

    // cupom inválido
    await user.type(within(dialog).getByLabelText('Cupom de desconto'), 'NAOEXISTE')
    await user.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    expect(await within(dialog).findByText(/inválido/i)).toBeInTheDocument()

    // aumenta a quantidade até passar o pedido mínimo (R$ 20)
    const plus = () => within(dialog).getByRole('button', { name: /^Aumentar / })
    const continuar = within(dialog).getByRole('button', { name: 'Continuar' })
    for (let i = 0; i < 40 && continuar.hasAttribute('disabled'); i++) await user.click(plus())
    expect(continuar).toBeEnabled()

    // cupom válido
    const input = within(dialog).getByLabelText('Cupom de desconto')
    await user.clear(input)
    await user.type(input, 'bemvindo10')
    await user.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    expect(await within(dialog).findByText(/BEMVINDO10/)).toBeInTheDocument()
    expect(within(dialog).getByText('Desconto')).toBeInTheDocument()

    await user.click(continuar)
    // validações do checkout
    await user.click(within(dialog).getByRole('button', { name: /Enviar pedido/ }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Informe seu nome')

    await user.type(within(dialog).getByLabelText('Seu nome'), 'Maria')
    await user.type(within(dialog).getByLabelText('Seu WhatsApp'), '21987654321')
    expect(within(dialog).getByLabelText('Seu WhatsApp')).toHaveValue('(21) 98765-4321')
    await user.type(within(dialog).getByLabelText(/Endereço/), 'Rua A, 10')
    await user.click(within(dialog).getByRole('button', { name: /Enviar pedido/ }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('bairro')

    const zone = within(dialog).getByLabelText('Bairro')
    await user.selectOptions(zone, (within(zone).getAllByRole('option')[1] as HTMLOptionElement).value)
    await user.click(within(dialog).getByRole('button', { name: /Enviar pedido/ }))

    expect(await screen.findByText(/Pedido #DEMO registrado/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Ver mensagem no WhatsApp/ })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d+\?text=/)
    const text = decodeURIComponent(link.getAttribute('href')!.split('?text=')[1])
    expect(text).toContain('NOVO PEDIDO')
    expect(text).toContain('Cupom BEMVINDO10')
    expect(text).toContain('Maria')
  })

  it('ESC fecha o carrinho e a ficha da loja mostra horários', async () => {
    const user = userEvent.setup()
    renderShop()
    await user.click(screen.getByRole('button', { name: 'Informações da loja' }))
    const info = screen.getByRole('dialog', { name: 'Sobre a loja' })
    expect(within(info).getByText('Segunda')).toBeInTheDocument()
    expect(within(info).getByText('Domingo')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
