# HORTION — loja digital multi-loja para hortifrutis

Um único sistema atende **todos** os seus clientes. Cada hortifruti é um cadastro novo
(`seusite.com/horti-verde`), com marca, produtos, preços e WhatsApp próprios.
**Implantar um cliente novo leva ~5 minutos, sem copiar projeto nem mexer em código.**

## O que tem

**Para o cliente final** (`/nome-da-loja`)
- Catálogo por categoria, busca, foto/emoji, preço, oferta e indisponível
- Quantidade de 0,5 em 0,5 kg, observação por item ("bem maduro"), boxes
- Entrega por bairro, retirada, pedido mínimo, frete grátis acima de um valor
- Pedido salvo no painel **e** enviado organizado para o WhatsApp da loja
- Preços recalculados no servidor (cliente não consegue adulterar o valor)

**Para o lojista** (`/painel`)
- ⚡ **Atualização Express**: todos os preços do dia numa tela, publicar de uma vez
- Disponibilidade com um toque, produtos, categorias, boxes, importar/exportar CSV
- Pedidos com status (novo → separando → em rota → entregue), atualiza sozinho
- Link da loja, QR Code em alta resolução, logo e cor da loja

**Para você (implantação)**
- Catálogo-modelo com 67 itens de hortifruti, copiado em cada loja nova
- **Duplicar loja** (Configurações → "Implantar para um cliente")
- **Transferir loja** para o e-mail do dono
- Licença por loja (`active_until`): vencida, a loja para de receber pedidos
- `/demo` funciona sem banco, ótima para mostrar na venda

## Colocar no ar (uma vez só, ~15 min)

### 1. Criar o projeto Supabase
Em [supabase.com](https://supabase.com) crie um projeto gratuito.

### 2. Criar as tabelas
No Supabase: **SQL Editor → New query**, cole o conteúdo de
`supabase/migrations/001_init.sql` e clique em **Run**.

Em **Authentication → Providers → Email**, para o dono entrar sem confirmar e-mail
(mais simples na implantação), desative **Confirm email**.

### 3. Configurar as chaves
```bash
cp .env.example .env
```
Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
(Supabase → Project Settings → API). Opcional: `VITE_SALES_WHATSAPP` e `VITE_BRAND_NAME`.

### 4. Rodar / publicar
```bash
npm install
npm run dev        # teste local em http://localhost:5173
npm run build      # gera a pasta dist/
```
Publique no **Vercel** ou **Netlify** (importe a pasta/repositório; build `npm run build`,
saída `dist`) e cadastre as duas variáveis `VITE_SUPABASE_*` no painel da hospedagem.
Os arquivos `vercel.json` e `public/_redirects` já resolvem as rotas.
Depois de publicar, em **Supabase → Authentication → URL Configuration** coloque o endereço do site.

## Implantar um novo hortifruti (rotina)

1. Entre no `/painel` com a sua conta.
2. **Configurações → Implantar para um cliente** (duplica a loja-base) **ou**
   menu do topo → nova loja (`/painel/nova`): nome, endereço, WhatsApp e cor.
3. **⚡ Preços**: preencha os preços (produto com preço entra no ar sozinho).
4. **Configurações**: logo, endereço, horário, Pix, bairros e taxas.
5. Baixe o QR Code no **Início** e configure o link no Google e na bio do Instagram.
6. **Entregue ao dono**: Configurações → *Transferir esta loja* (ele cria a conta antes)
   ou passe seu acesso, se preferir operar por ele.
7. Libere a licença de 12 meses no SQL Editor:
   ```sql
   select activate_store('horti-verde', 12);
   ```
   Toda loja nova começa em **teste de 14 dias**.

## Rotina de licenças

| Ação | SQL (SQL Editor) |
|---|---|
| Ativar/renovar N meses | `select activate_store('slug', 12);` |
| Ver vencimentos | `select name, slug, plan, active_until from stores order by active_until;` |
| Suspender | `update stores set is_published = false where slug = 'slug';` |

O lojista **não** consegue alterar plano, validade, dono nem contador de pedidos (trigger no banco).

## CSV de produtos
Colunas: `nome;unidade;preco;categoria` (separador `;` ou `,`).
Unidades: `kg`, `un`, `dz` (dúzia), `mc` (maço), `bd` (bandeja).
Produto com o mesmo nome é atualizado; categoria nova é criada.

## Estrutura
```
supabase/migrations/001_init.sql   banco, RLS, funções (create_store, create_order, clone_store, transfer_store)
src/pages/Storefront.tsx           vitrine pública + carrinho + checkout
src/admin/*                        painel (preços express, produtos, boxes, pedidos, config)
src/lib/demoData.ts                loja /demo (sem banco)
```

## Próximos passos sugeridos
- Domínio próprio por loja (`loja.com.br` apontando para o mesmo app) — exige mapear domínio→slug.
- Notificação sonora/WhatsApp automático de novo pedido (Supabase Edge Function).
- Cobrança automática de licença (InfinitePay/Stripe) chamando `activate_store`.


## Versão 2 (montador, cupons, horários)

- **/montar**: montador interativo com prévia ao vivo em celular. Quem chega monta a loja, cria a conta e publica (`create_store_from_draft`). Preços "de exemplo" aparecem em amarelo e **nunca** são publicados.
- **Página de vendas** (`/`): demonstração interativa, 3 lojas demo (`/demo`, `/demo-organicos`, `/demo-feira`), planos, dúvidas e formulário de contato.
- **Vitrine**: destaques, linhas por categoria com "Ver todos", cupom, "Sobre a loja" com horário por dia e pedido mínimo.
- **Painel**: cupons (`/painel/cupons`), ★ destaque, horário por dia, plano com link de ativação.
- **Banco**: rode `supabase/migrations/002_v2.sql` depois do 001 (já aplicado no projeto criado nesta sessão).
- **Planos e preços** da página: edite só `src/lib/plans.ts`.
- **Contatos da página de vendas**: SQL Editor → `select * from leads order by created_at desc;`
- **Ativar uma loja após o teste**: `select activate_store('slug-da-loja', 12);`
- **Testes**: `npm test` (29 testes) · `npm run check` roda tipos + testes + build.
