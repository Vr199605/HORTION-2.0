-- =====================================================================
-- HORTION · Banco multi-loja
-- Rode este arquivo UMA vez no SQL Editor do Supabase.
-- Depois disso, cada novo hortifruti é só um cadastro novo no painel.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'),
  name text not null,
  tagline text default 'Frescor todos os dias',
  whatsapp text not null,                       -- somente dígitos, com DDI (ex: 5521987654321)
  logo_url text,
  primary_color text not null default '#16a34a',
  address text,
  hours text,
  pix_key text,
  is_open boolean not null default true,
  is_published boolean not null default true,
  accepts_delivery boolean not null default true,
  accepts_pickup boolean not null default true,
  min_order numeric(10,2) not null default 0,
  default_delivery_fee numeric(10,2) not null default 0,
  free_delivery_from numeric(10,2) not null default 0,
  order_seq integer not null default 0,
  plan text not null default 'trial',
  active_until timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  fee numeric(10,2) not null default 0,
  sort integer not null default 0
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  emoji text default '🛒',
  sort integer not null default 0
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  emoji text default '🛒',
  image_url text,
  unit text not null default 'kg' check (unit in ('kg','un','dz','mc','bd')),
  price numeric(10,2) not null default 0,
  offer_price numeric(10,2),
  available boolean not null default false,
  note text,                                    -- ex: "peso aproximado"
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists products_store_idx on public.products(store_id);

create table if not exists public.boxes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  emoji text default '📦',
  description text,
  items text[] not null default '{}',           -- lista simples do que vem no box
  price numeric(10,2) not null default 0,
  available boolean not null default true,
  sort integer not null default 0
);
create index if not exists boxes_store_idx on public.boxes(store_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  customer_name text not null,
  customer_phone text,
  delivery_type text not null default 'delivery' check (delivery_type in ('delivery','pickup')),
  address text,
  neighborhood text,
  payment_method text,
  notes text,
  subtotal numeric(10,2) not null,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  status text not null default 'novo' check (status in ('novo','separando','saiu','entregue','cancelado')),
  created_at timestamptz not null default now()
);
create index if not exists orders_store_idx on public.orders(store_id, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null,
  unit text not null,
  qty numeric(10,3) not null,
  unit_price numeric(10,2) not null,
  line_total numeric(10,2) not null,
  note text
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- Catálogo-modelo copiado para cada loja nova (é o que torna a implantação rápida)
create table if not exists public.template_products (
  id serial primary key,
  category text not null,
  category_emoji text not null,
  category_sort integer not null,
  name text not null,
  emoji text not null,
  unit text not null,
  sort integer not null
);

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------
create or replace function public.is_store_owner(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from stores where id = sid and owner_id = auth.uid());
$$;

-- Impede que o lojista altere plano, validade, dono ou contador de pedidos
create or replace function public.protect_store_fields()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.bypass', true), '') <> '1' and auth.uid() is not null then
    new.owner_id := old.owner_id;
    new.plan := old.plan;
    new.active_until := old.active_until;
    new.order_seq := old.order_seq;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_store_fields on public.stores;
create trigger trg_protect_store_fields before update on public.stores
  for each row execute function public.protect_store_fields();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.boxes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.template_products enable row level security;

-- Lojas: público lê as publicadas; dono lê/edita as dele
drop policy if exists stores_read on public.stores;
create policy stores_read on public.stores for select
  using (is_published or owner_id = auth.uid());
drop policy if exists stores_update on public.stores;
create policy stores_update on public.stores for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists stores_delete on public.stores;
create policy stores_delete on public.stores for delete
  using (owner_id = auth.uid());
-- insert só via função create_store()

-- Tabelas filhas: leitura pública (da loja publicada), escrita só do dono
do $$
declare t text;
begin
  foreach t in array array['delivery_zones','categories','products','boxes'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format($p$create policy %I_read on public.%I for select
      using (exists (select 1 from public.stores s where s.id = store_id and (s.is_published or s.owner_id = auth.uid())))$p$, t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($p$create policy %I_write on public.%I for all
      using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id))$p$, t, t);
  end loop;
end $$;

-- Pedidos: só o dono vê; clientes criam via create_order()
drop policy if exists orders_owner on public.orders;
create policy orders_owner on public.orders for all
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

drop policy if exists order_items_owner on public.order_items;
create policy order_items_owner on public.order_items for all
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_store_owner(o.store_id)))
  with check (exists (select 1 from public.orders o where o.id = order_id and public.is_store_owner(o.store_id)));

drop policy if exists template_read on public.template_products;
create policy template_read on public.template_products for select using (true);

-- ---------------------------------------------------------------------
-- RPC: criar loja (copia o catálogo-modelo em 1 chamada)
-- ---------------------------------------------------------------------
create or replace function public.create_store(
  p_name text, p_slug text, p_whatsapp text, p_color text default '#16a34a', p_seed boolean default true
) returns public.stores
language plpgsql security definer set search_path = public as $$
declare
  s public.stores;
  v_slug text := lower(trim(p_slug));
  v_phone text := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
  r record;
  v_cat uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para criar a loja'; end if;
  if v_slug in ('painel','demo','conheca','login','cadastro','api','admin','app','www','loja','l') then
    raise exception 'Esse endereço é reservado, escolha outro';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' then
    raise exception 'Endereço inválido: use letras minúsculas, números e hífen (3 a 40 caracteres)';
  end if;
  if exists (select 1 from stores where slug = v_slug) then
    raise exception 'Esse endereço já está em uso';
  end if;
  if length(v_phone) < 10 then raise exception 'WhatsApp inválido'; end if;
  if length(v_phone) <= 11 then v_phone := '55' || v_phone; end if;

  insert into stores (owner_id, slug, name, whatsapp, primary_color)
  values (auth.uid(), v_slug, trim(p_name), v_phone, coalesce(p_color, '#16a34a'))
  returning * into s;

  if p_seed then
    for r in select distinct category, category_emoji, category_sort from template_products order by category_sort loop
      insert into categories (store_id, name, emoji, sort)
      values (s.id, r.category, r.category_emoji, r.category_sort) returning id into v_cat;

      insert into products (store_id, category_id, name, emoji, unit, price, available, sort)
      select s.id, v_cat, t.name, t.emoji, t.unit, 0, false, t.sort
      from template_products t where t.category = r.category order by t.sort;
    end loop;

    insert into boxes (store_id, name, emoji, description, items, price, available, sort) values
      (s.id, 'Box Econômico', '📦', 'O básico da semana', array['Banana','Maçã','Tomate','Cenoura'], 0, false, 1),
      (s.id, 'Box Semanal', '🧺', 'Variedade para a semana', array['8 frutas','5 verduras','4 legumes'], 0, false, 2),
      (s.id, 'Box Família', '🥬', 'Para a casa toda', array['Frutas da estação','Folhas frescas','Legumes'], 0, false, 3);
  end if;

  return s;
end $$;

-- ---------------------------------------------------------------------
-- RPC: criar pedido (preços SEMPRE recalculados no servidor)
-- p_customer: {name, phone, delivery_type, address, neighborhood, zone_id, payment_method, notes}
-- p_items:    [{kind:'product'|'box', id, qty, note}]
-- ---------------------------------------------------------------------
create or replace function public.create_order(p_slug text, p_customer jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.stores;
  it jsonb;
  pr public.products;
  bx public.boxes;
  z public.delivery_zones;
  v_qty numeric; v_price numeric; v_line numeric;
  v_subtotal numeric := 0; v_fee numeric := 0; v_total numeric;
  v_type text := coalesce(p_customer->>'delivery_type', 'delivery');
  v_oid uuid; v_code text; v_lines jsonb := '[]'::jsonb;
  v_name text; v_unit text;
begin
  select * into s from stores where slug = lower(p_slug) and is_published;
  if not found then raise exception 'Loja não encontrada'; end if;
  if s.active_until < now() then raise exception 'Esta loja está temporariamente indisponível'; end if;
  if not s.is_open then raise exception 'A loja está fechada no momento'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Carrinho vazio'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Itens demais no pedido'; end if;
  if coalesce(trim(p_customer->>'name'), '') = '' then raise exception 'Informe seu nome'; end if;
  if v_type not in ('delivery','pickup') then raise exception 'Tipo de entrega inválido'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000 then raise exception 'Quantidade inválida'; end if;

    if it->>'kind' = 'box' then
      select * into bx from boxes where id = (it->>'id')::uuid and store_id = s.id and available and price > 0;
      if not found then raise exception 'Um box do carrinho não está mais disponível'; end if;
      v_name := bx.name; v_unit := 'un'; v_price := bx.price;
    else
      select * into pr from products where id = (it->>'id')::uuid and store_id = s.id and available and price > 0;
      if not found then raise exception 'Um produto do carrinho não está mais disponível'; end if;
      v_name := pr.name; v_unit := pr.unit; v_price := coalesce(pr.offer_price, pr.price);
    end if;

    v_line := round(v_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line;
    v_lines := v_lines || jsonb_build_object(
      'name', v_name, 'unit', v_unit, 'qty', v_qty, 'unit_price', v_price,
      'line_total', v_line, 'note', nullif(trim(coalesce(it->>'note','')), ''));
  end loop;

  if v_subtotal < s.min_order then
    raise exception 'Pedido mínimo: R$ %', to_char(s.min_order, 'FM999990D00');
  end if;

  if v_type = 'delivery' then
    if not s.accepts_delivery then raise exception 'Esta loja não faz entregas'; end if;
    if nullif(p_customer->>'zone_id','') is not null then
      select * into z from delivery_zones where id = (p_customer->>'zone_id')::uuid and store_id = s.id;
      v_fee := coalesce(z.fee, s.default_delivery_fee);
    else
      v_fee := s.default_delivery_fee;
    end if;
    if s.free_delivery_from > 0 and v_subtotal >= s.free_delivery_from then v_fee := 0; end if;
  else
    if not s.accepts_pickup then raise exception 'Esta loja não tem retirada'; end if;
  end if;

  v_total := v_subtotal + v_fee;

  perform set_config('app.bypass', '1', true);
  update stores set order_seq = order_seq + 1 where id = s.id returning order_seq into s.order_seq;
  v_code := '#' || lpad(s.order_seq::text, 4, '0');

  insert into orders (store_id, code, customer_name, customer_phone, delivery_type, address, neighborhood,
                      payment_method, notes, subtotal, delivery_fee, total)
  values (s.id, v_code, left(trim(p_customer->>'name'), 80), left(p_customer->>'phone', 30), v_type,
          left(p_customer->>'address', 200), left(p_customer->>'neighborhood', 80),
          left(p_customer->>'payment_method', 40), left(p_customer->>'notes', 300),
          v_subtotal, v_fee, v_total)
  returning id into v_oid;

  insert into order_items (order_id, name, unit, qty, unit_price, line_total, note)
  select v_oid, x->>'name', x->>'unit', (x->>'qty')::numeric, (x->>'unit_price')::numeric,
         (x->>'line_total')::numeric, x->>'note'
  from jsonb_array_elements(v_lines) x;

  return jsonb_build_object('id', v_oid, 'code', v_code, 'subtotal', v_subtotal,
                            'delivery_fee', v_fee, 'total', v_total, 'items', v_lines);
end $$;

-- ---------------------------------------------------------------------
-- RPC: transferir loja para outro e-mail (implantação para o cliente)
-- Você cria a loja na sua conta, configura e entrega ao dono com 1 chamada.
-- ---------------------------------------------------------------------
create or replace function public.transfer_store(p_slug text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_store uuid;
begin
  select id into v_store from stores where slug = lower(p_slug) and owner_id = auth.uid();
  if v_store is null then raise exception 'Loja não encontrada na sua conta'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'Esse e-mail ainda não criou conta. Peça para o cliente se cadastrar primeiro.'; end if;
  perform set_config('app.bypass', '1', true);
  update stores set owner_id = v_user where id = v_store;
end $$;

-- ---------------------------------------------------------------------
-- Administração da plataforma (rode no SQL Editor; não exposto ao app)
-- Ex.: select activate_store('horti-verde', 12);   -- libera 12 meses
-- ---------------------------------------------------------------------
create or replace function public.activate_store(p_slug text, p_months integer default 12)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  perform set_config('app.bypass', '1', true);
  update stores
     set plan = 'ativo',
         active_until = greatest(active_until, now()) + make_interval(months => p_months)
   where slug = lower(p_slug)
   returning active_until into v;
  return v;
end $$;

revoke all on function public.activate_store(text, integer) from public, anon, authenticated;
grant execute on function public.create_store(text, text, text, text, boolean) to authenticated;
grant execute on function public.create_order(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.transfer_store(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: logos e fotos (pasta = id da loja)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('store-assets', 'store-assets', true)
on conflict (id) do nothing;

drop policy if exists "assets_read" on storage.objects;
create policy "assets_read" on storage.objects for select using (bucket_id = 'store-assets');

drop policy if exists "assets_write" on storage.objects;
create policy "assets_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'store-assets' and public.is_store_owner(((storage.foldername(name))[1])::uuid));

drop policy if exists "assets_update" on storage.objects;
create policy "assets_update" on storage.objects for update to authenticated
  using (bucket_id = 'store-assets' and public.is_store_owner(((storage.foldername(name))[1])::uuid));

drop policy if exists "assets_delete" on storage.objects;
create policy "assets_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'store-assets' and public.is_store_owner(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------
-- Catálogo-modelo de hortifruti (unidades: kg, un, dz, mc=maço, bd=bandeja)
-- ---------------------------------------------------------------------
truncate public.template_products restart identity;
insert into public.template_products (category, category_emoji, category_sort, name, emoji, unit, sort) values
-- Frutas
('Frutas','🍎',1,'Banana Prata','🍌','dz',1),
('Frutas','🍎',1,'Banana Nanica','🍌','dz',2),
('Frutas','🍎',1,'Maçã Fuji','🍎','kg',3),
('Frutas','🍎',1,'Maçã Gala','🍎','kg',4),
('Frutas','🍎',1,'Laranja Pera','🍊','kg',5),
('Frutas','🍎',1,'Laranja Lima','🍊','kg',6),
('Frutas','🍎',1,'Limão Taiti','🍋','kg',7),
('Frutas','🍎',1,'Mamão Papaia','🥭','un',8),
('Frutas','🍎',1,'Mamão Formosa','🥭','kg',9),
('Frutas','🍎',1,'Melancia','🍉','kg',10),
('Frutas','🍎',1,'Melão','🍈','un',11),
('Frutas','🍎',1,'Abacaxi','🍍','un',12),
('Frutas','🍎',1,'Manga Palmer','🥭','kg',13),
('Frutas','🍎',1,'Uva Verde','🍇','kg',14),
('Frutas','🍎',1,'Uva Roxa','🍇','kg',15),
('Frutas','🍎',1,'Pera','🍐','kg',16),
('Frutas','🍎',1,'Abacate','🥑','un',17),
('Frutas','🍎',1,'Morango','🍓','bd',18),
('Frutas','🍎',1,'Kiwi','🥝','kg',19),
('Frutas','🍎',1,'Goiaba','🍈','kg',20),
('Frutas','🍎',1,'Maracujá','🍈','kg',21),
('Frutas','🍎',1,'Coco Verde','🥥','un',22),
-- Verduras
('Verduras','🥬',2,'Alface Crespa','🥬','un',1),
('Verduras','🥬',2,'Alface Americana','🥬','un',2),
('Verduras','🥬',2,'Alface Roxa','🥬','un',3),
('Verduras','🥬',2,'Couve','🥬','mc',4),
('Verduras','🥬',2,'Espinafre','🥬','mc',5),
('Verduras','🥬',2,'Rúcula','🥬','mc',6),
('Verduras','🥬',2,'Agrião','🥬','mc',7),
('Verduras','🥬',2,'Brócolis','🥦','un',8),
('Verduras','🥬',2,'Couve-flor','🥦','un',9),
('Verduras','🥬',2,'Repolho Verde','🥬','kg',10),
('Verduras','🥬',2,'Acelga','🥬','mc',11),
('Verduras','🥬',2,'Chicória','🥬','mc',12),
-- Legumes
('Legumes','🥕',3,'Tomate Italiano','🍅','kg',1),
('Legumes','🥕',3,'Tomate Salada','🍅','kg',2),
('Legumes','🥕',3,'Tomate Cereja','🍅','bd',3),
('Legumes','🥕',3,'Cebola','🧅','kg',4),
('Legumes','🥕',3,'Cebola Roxa','🧅','kg',5),
('Legumes','🥕',3,'Batata Inglesa','🥔','kg',6),
('Legumes','🥕',3,'Batata Doce','🍠','kg',7),
('Legumes','🥕',3,'Cenoura','🥕','kg',8),
('Legumes','🥕',3,'Beterraba','🍠','kg',9),
('Legumes','🥕',3,'Abobrinha','🥒','kg',10),
('Legumes','🥕',3,'Pepino','🥒','kg',11),
('Legumes','🥕',3,'Pimentão Verde','🫑','kg',12),
('Legumes','🥕',3,'Pimentão Vermelho','🫑','kg',13),
('Legumes','🥕',3,'Berinjela','🍆','kg',14),
('Legumes','🥕',3,'Chuchu','🥒','kg',15),
('Legumes','🥕',3,'Abóbora Cabotiá','🎃','kg',16),
('Legumes','🥕',3,'Mandioca','🥔','kg',17),
('Legumes','🥕',3,'Inhame','🥔','kg',18),
('Legumes','🥕',3,'Milho Verde','🌽','un',19),
('Legumes','🥕',3,'Vagem','🫛','kg',20),
-- Temperos
('Temperos','🌿',4,'Alho','🧄','kg',1),
('Temperos','🌿',4,'Cheiro-verde','🌿','mc',2),
('Temperos','🌿',4,'Salsinha','🌿','mc',3),
('Temperos','🌿',4,'Cebolinha','🌿','mc',4),
('Temperos','🌿',4,'Coentro','🌿','mc',5),
('Temperos','🌿',4,'Hortelã','🌿','mc',6),
('Temperos','🌿',4,'Manjericão','🌿','mc',7),
('Temperos','🌿',4,'Gengibre','🫚','kg',8),
('Temperos','🌿',4,'Pimenta Dedo-de-moça','🌶️','kg',9),
-- Ovos e outros
('Ovos e Outros','🥚',5,'Ovos Brancos (dúzia)','🥚','dz',1),
('Ovos e Outros','🥚',5,'Ovos Vermelhos (dúzia)','🥚','dz',2),
('Ovos e Outros','🥚',5,'Ovos de Codorna','🥚','bd',3),
('Ovos e Outros','🥚',5,'Cogumelo Champignon','🍄','bd',4);

-- ---------------------------------------------------------------------
-- RPC: duplicar uma loja (copia categorias, produtos, boxes e bairros)
-- Ideal para clientes da mesma região: clone a loja-base e ajuste os preços.
-- ---------------------------------------------------------------------
create or replace function public.clone_store(
  p_source_slug text, p_name text, p_slug text, p_whatsapp text, p_copy_prices boolean default true
) returns public.stores
language plpgsql security definer set search_path = public as $$
declare
  src public.stores;
  dst public.stores;
  r record;
  v_new_cat uuid;
begin
  select * into src from stores where slug = lower(p_source_slug) and owner_id = auth.uid();
  if not found then raise exception 'Loja de origem não encontrada na sua conta'; end if;

  dst := public.create_store(p_name, p_slug, p_whatsapp, src.primary_color, false);

  perform set_config('app.bypass', '1', true);
  update stores set
    tagline = src.tagline, hours = src.hours, min_order = src.min_order,
    default_delivery_fee = src.default_delivery_fee, free_delivery_from = src.free_delivery_from,
    accepts_delivery = src.accepts_delivery, accepts_pickup = src.accepts_pickup
  where id = dst.id returning * into dst;

  for r in select * from categories where store_id = src.id order by sort loop
    insert into categories (store_id, name, emoji, sort) values (dst.id, r.name, r.emoji, r.sort)
    returning id into v_new_cat;

    insert into products (store_id, category_id, name, emoji, unit, price, available, note, sort)
    select dst.id, v_new_cat, name, emoji, unit,
           case when p_copy_prices then price else 0 end,
           case when p_copy_prices then available else false end,
           note, sort
    from products where category_id = r.id;
  end loop;

  insert into products (store_id, name, emoji, unit, price, available, note, sort)
  select dst.id, name, emoji, unit,
         case when p_copy_prices then price else 0 end,
         case when p_copy_prices then available else false end, note, sort
  from products where store_id = src.id and category_id is null;

  insert into boxes (store_id, name, emoji, description, items, price, available, sort)
  select dst.id, name, emoji, description, items,
         case when p_copy_prices then price else 0 end,
         case when p_copy_prices then available else false end, sort
  from boxes where store_id = src.id;

  insert into delivery_zones (store_id, name, fee, sort)
  select dst.id, name, fee, sort from delivery_zones where store_id = src.id;

  return dst;
end $$;

grant execute on function public.clone_store(text, text, text, text, boolean) to authenticated;
