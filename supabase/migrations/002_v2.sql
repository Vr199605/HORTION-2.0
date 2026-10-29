-- =====================================================================
-- HORTION v2 · destaques, cupons, horários por dia, leads, montador
-- Rode DEPOIS do 001_init.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------
alter table public.stores
  add column if not exists phone text,
  add column if not exists about text,
  add column if not exists hours_json jsonb;   -- {"seg":{"open":"07:00","close":"18:00"},"dom":null,...}

alter table public.products add column if not exists featured boolean not null default false;

alter table public.orders
  add column if not exists discount numeric(10,2) not null default 0,
  add column if not exists coupon_code text;

-- ---------------------------------------------------------------------
-- Cupons
-- ---------------------------------------------------------------------
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9_-]{3,20}$'),
  kind text not null check (kind in ('percent','fixed')),
  value numeric(10,2) not null check (value > 0),
  min_order numeric(10,2) not null default 0,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);
create unique index if not exists coupons_store_code_idx on public.coupons (store_id, upper(code));

alter table public.coupons enable row level security;
drop policy if exists coupons_owner on public.coupons;
create policy coupons_owner on public.coupons for all
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

-- ---------------------------------------------------------------------
-- Leads da página de vendas (ninguém lê pelo app; veja no SQL Editor)
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text,
  whatsapp text,
  city text,
  segment text,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;   -- sem policies = ninguém acessa via API

create or replace function public.submit_lead(
  p_name text, p_company text, p_email text, p_whatsapp text, p_city text, p_segment text
) returns void language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Informe seu nome'; end if;
  if length(v_phone) < 10 then raise exception 'Informe um WhatsApp válido, com DDD'; end if;
  if (select count(*) from leads where whatsapp = v_phone and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Recebemos seu contato. Aguarde que vamos falar com você.';
  end if;
  insert into leads (name, company, email, whatsapp, city, segment)
  values (left(trim(p_name), 100), left(trim(coalesce(p_company, '')), 100), left(trim(coalesce(p_email, '')), 120),
          v_phone, left(trim(coalesce(p_city, '')), 80), left(trim(coalesce(p_segment, '')), 40));
end $$;

-- ---------------------------------------------------------------------
-- Loja aberta agora? (horário por dia, fuso de São Paulo)
-- ---------------------------------------------------------------------
create or replace function public.store_is_open_now(s public.stores)
returns boolean language plpgsql stable set search_path = public as $$
declare
  local_ts timestamp := (now() at time zone 'America/Sao_Paulo');
  keys text[] := array['dom','seg','ter','qua','qui','sex','sab'];
  k text := keys[extract(dow from local_ts)::int + 1];
  d jsonb; t time; o time; c time;
begin
  if not s.is_open then return false; end if;
  if s.hours_json is null then return true; end if;
  d := s.hours_json -> k;
  if d is null or jsonb_typeof(d) <> 'object' then return false; end if;
  o := (d->>'open')::time; c := (d->>'close')::time; t := local_ts::time;
  if c > o then return t >= o and t < c; end if;
  return t >= o or t < c;   -- vira a meia-noite
end $$;

-- ---------------------------------------------------------------------
-- Validar cupom (cliente vê o desconto antes de enviar)
-- ---------------------------------------------------------------------
create or replace function public.validate_coupon(p_slug text, p_code text, p_subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.stores; c public.coupons; d numeric;
begin
  select * into s from stores where slug = lower(p_slug) and is_published;
  if not found then return jsonb_build_object('valid', false, 'message', 'Loja não encontrada'); end if;
  select * into c from coupons
   where store_id = s.id and upper(code) = upper(trim(p_code)) and active
     and (expires_at is null or expires_at > now());
  if not found then return jsonb_build_object('valid', false, 'message', 'Cupom inválido ou expirado'); end if;
  if c.max_uses is not null and c.uses >= c.max_uses then
    return jsonb_build_object('valid', false, 'message', 'Este cupom já foi totalmente utilizado');
  end if;
  if p_subtotal < c.min_order then
    return jsonb_build_object('valid', false, 'message', 'Válido para pedidos a partir de R$ ' || to_char(c.min_order, 'FM999990D00'));
  end if;
  d := case when c.kind = 'percent' then round(p_subtotal * c.value / 100, 2) else least(c.value, p_subtotal) end;
  return jsonb_build_object('valid', true, 'message', 'Cupom aplicado', 'code', upper(c.code),
                            'kind', c.kind, 'value', c.value, 'discount', d);
end $$;

-- ---------------------------------------------------------------------
-- create_store: lista de endereços reservados atualizada
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
  if v_slug in ('painel','demo','conheca','login','cadastro','api','admin','app','www','loja','l',
                'montar','planos','entrar','revenda','termos','privacidade','suporte','ajuda')
     or v_slug like 'demo%' then
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
-- Aplicar o rascunho do montador a uma loja (ou editar em lote)
-- p_draft: {tagline, about, address, phone, pix_key, hours_json, min_order,
--           default_delivery_fee, free_delivery_from, accepts_delivery, accepts_pickup,
--           zones:[{name,fee}], products:[{name,price,unit,category,emoji,featured,available}]}
-- ---------------------------------------------------------------------
create or replace function public.apply_builder_draft(p_slug text, p_draft jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.stores;
  el jsonb;
  v_name text; v_price numeric; v_unit text; v_catname text; v_cat uuid; v_pid uuid;
  v_avail boolean; v_feat boolean; v_emoji text; v_del boolean; v_pick boolean; v_n int := 0;
begin
  select * into s from stores where slug = lower(p_slug) and owner_id = auth.uid();
  if not found then raise exception 'Loja não encontrada na sua conta'; end if;
  if jsonb_typeof(p_draft) <> 'object' then raise exception 'Rascunho inválido'; end if;

  v_del := coalesce((p_draft->>'accepts_delivery')::boolean, true);
  v_pick := coalesce((p_draft->>'accepts_pickup')::boolean, true);
  if not v_del and not v_pick then v_pick := true; end if;

  update stores set
    tagline = coalesce(nullif(trim(p_draft->>'tagline'), ''), tagline),
    about = nullif(trim(p_draft->>'about'), ''),
    address = nullif(trim(p_draft->>'address'), ''),
    phone = nullif(trim(p_draft->>'phone'), ''),
    pix_key = nullif(trim(p_draft->>'pix_key'), ''),
    hours_json = case when jsonb_typeof(p_draft->'hours_json') = 'object' then p_draft->'hours_json' else null end,
    min_order = least(greatest(coalesce((p_draft->>'min_order')::numeric, 0), 0), 100000),
    default_delivery_fee = least(greatest(coalesce((p_draft->>'default_delivery_fee')::numeric, 0), 0), 100000),
    free_delivery_from = least(greatest(coalesce((p_draft->>'free_delivery_from')::numeric, 0), 0), 100000),
    accepts_delivery = v_del,
    accepts_pickup = v_pick
  where id = s.id;

  if jsonb_typeof(p_draft->'zones') = 'array' then
    delete from delivery_zones where store_id = s.id;
    for el in select * from jsonb_array_elements(p_draft->'zones') limit 100 loop
      if coalesce(trim(el->>'name'), '') <> '' then
        insert into delivery_zones (store_id, name, fee, sort)
        values (s.id, left(trim(el->>'name'), 60),
                least(greatest(coalesce((el->>'fee')::numeric, 0), 0), 10000), v_n);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_draft->'products') = 'array' then
    if jsonb_array_length(p_draft->'products') > 400 then raise exception 'Produtos demais no rascunho'; end if;
    for el in select * from jsonb_array_elements(p_draft->'products') loop
      v_name := trim(coalesce(el->>'name', ''));
      if v_name = '' then continue; end if;
      v_price := least(greatest(coalesce((el->>'price')::numeric, 0), 0), 100000);
      v_avail := v_price > 0 and coalesce((el->>'available')::boolean, true);
      v_feat := v_avail and coalesce((el->>'featured')::boolean, false);

      select id into v_pid from products where store_id = s.id and lower(name) = lower(v_name) limit 1;
      if v_pid is not null then
        update products set price = v_price, available = v_avail, featured = v_feat where id = v_pid;
      else
        v_unit := coalesce(el->>'unit', 'kg');
        if v_unit not in ('kg','un','dz','mc','bd') then v_unit := 'kg'; end if;
        v_catname := coalesce(nullif(trim(el->>'category'), ''), 'Outros');
        select id into v_cat from categories where store_id = s.id and lower(name) = lower(v_catname) limit 1;
        if v_cat is null then
          insert into categories (store_id, name, emoji, sort)
          values (s.id, left(v_catname, 40), '🛒', 90) returning id into v_cat;
        end if;
        v_emoji := coalesce(nullif(left(el->>'emoji', 4), ''), '🛒');
        insert into products (store_id, category_id, name, emoji, unit, price, available, featured, sort)
        values (s.id, v_cat, left(v_name, 80), v_emoji, v_unit, v_price, v_avail, v_feat, 900);
      end if;
    end loop;
  end if;
end $$;

-- Cria a loja já configurada com o rascunho (tudo ou nada)
create or replace function public.create_store_from_draft(
  p_name text, p_slug text, p_whatsapp text, p_color text, p_draft jsonb
) returns public.stores
language plpgsql security definer set search_path = public as $$
declare s public.stores;
begin
  s := public.create_store(p_name, p_slug, p_whatsapp, p_color, true);
  perform public.apply_builder_draft(s.slug, p_draft);
  select * into s from stores where id = s.id;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- create_order v2: cupom, desconto e horário por dia
-- p_customer aceita também: coupon
-- ---------------------------------------------------------------------
create or replace function public.create_order(p_slug text, p_customer jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.stores;
  it jsonb;
  pr public.products;
  bx public.boxes;
  z public.delivery_zones;
  cp public.coupons;
  v_qty numeric; v_price numeric; v_line numeric;
  v_subtotal numeric := 0; v_fee numeric := 0; v_discount numeric := 0; v_total numeric;
  v_type text := coalesce(p_customer->>'delivery_type', 'delivery');
  v_coupon text := nullif(trim(coalesce(p_customer->>'coupon', '')), '');
  v_coupon_code text;
  v_oid uuid; v_code text; v_lines jsonb := '[]'::jsonb;
  v_name text; v_unit text;
begin
  select * into s from stores where slug = lower(p_slug) and is_published;
  if not found then raise exception 'Loja não encontrada'; end if;
  if s.active_until < now() then raise exception 'Esta loja está temporariamente indisponível'; end if;
  if not public.store_is_open_now(s) then raise exception 'A loja está fechada no momento'; end if;
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

  -- cupom (consumo atômico respeitando max_uses)
  if v_coupon is not null then
    select * into cp from coupons
     where store_id = s.id and upper(code) = upper(v_coupon) and active
       and (expires_at is null or expires_at > now());
    if not found then raise exception 'Cupom inválido ou expirado'; end if;
    if v_subtotal < cp.min_order then
      raise exception 'Este cupom vale para pedidos a partir de R$ %', to_char(cp.min_order, 'FM999990D00');
    end if;
    update coupons set uses = uses + 1
     where id = cp.id and (max_uses is null or uses < max_uses);
    if not found then raise exception 'Este cupom já foi totalmente utilizado'; end if;
    v_discount := case when cp.kind = 'percent' then round(v_subtotal * cp.value / 100, 2)
                       else least(cp.value, v_subtotal) end;
    v_coupon_code := upper(cp.code);
  end if;

  if v_type = 'delivery' then
    if not s.accepts_delivery then raise exception 'Esta loja não faz entregas'; end if;
    if nullif(p_customer->>'zone_id','') is not null then
      select * into z from delivery_zones where id = (p_customer->>'zone_id')::uuid and store_id = s.id;
      v_fee := coalesce(z.fee, s.default_delivery_fee);
    else
      v_fee := s.default_delivery_fee;
    end if;
    if s.free_delivery_from > 0 and (v_subtotal - v_discount) >= s.free_delivery_from then v_fee := 0; end if;
  else
    if not s.accepts_pickup then raise exception 'Esta loja não tem retirada'; end if;
  end if;

  v_total := v_subtotal - v_discount + v_fee;

  perform set_config('app.bypass', '1', true);
  update stores set order_seq = order_seq + 1 where id = s.id returning order_seq into s.order_seq;
  v_code := '#' || lpad(s.order_seq::text, 4, '0');

  insert into orders (store_id, code, customer_name, customer_phone, delivery_type, address, neighborhood,
                      payment_method, notes, subtotal, discount, coupon_code, delivery_fee, total)
  values (s.id, v_code, left(trim(p_customer->>'name'), 80), left(p_customer->>'phone', 30), v_type,
          left(p_customer->>'address', 200), left(p_customer->>'neighborhood', 80),
          left(p_customer->>'payment_method', 40), left(p_customer->>'notes', 300),
          v_subtotal, v_discount, v_coupon_code, v_fee, v_total)
  returning id into v_oid;

  insert into order_items (order_id, name, unit, qty, unit_price, line_total, note)
  select v_oid, x->>'name', x->>'unit', (x->>'qty')::numeric, (x->>'unit_price')::numeric,
         (x->>'line_total')::numeric, x->>'note'
  from jsonb_array_elements(v_lines) x;

  return jsonb_build_object('id', v_oid, 'code', v_code, 'subtotal', v_subtotal, 'discount', v_discount,
                            'coupon_code', v_coupon_code, 'delivery_fee', v_fee, 'total', v_total, 'items', v_lines);
end $$;

-- ---------------------------------------------------------------------
-- clone_store v2: copia também destaque, sobre e horários
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
    tagline = src.tagline, about = src.about, hours = src.hours, hours_json = src.hours_json,
    min_order = src.min_order, default_delivery_fee = src.default_delivery_fee,
    free_delivery_from = src.free_delivery_from,
    accepts_delivery = src.accepts_delivery, accepts_pickup = src.accepts_pickup
  where id = dst.id returning * into dst;

  for r in select * from categories where store_id = src.id order by sort loop
    insert into categories (store_id, name, emoji, sort) values (dst.id, r.name, r.emoji, r.sort)
    returning id into v_new_cat;

    insert into products (store_id, category_id, name, emoji, unit, price, available, featured, note, sort)
    select dst.id, v_new_cat, name, emoji, unit,
           case when p_copy_prices then price else 0 end,
           case when p_copy_prices then available else false end,
           case when p_copy_prices then featured else false end,
           note, sort
    from products where category_id = r.id;
  end loop;

  insert into products (store_id, name, emoji, unit, price, available, featured, note, sort)
  select dst.id, name, emoji, unit,
         case when p_copy_prices then price else 0 end,
         case when p_copy_prices then available else false end,
         case when p_copy_prices then featured else false end, note, sort
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

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke all on function public.apply_builder_draft(text, jsonb) from public, anon;
revoke all on function public.create_store_from_draft(text, text, text, text, jsonb) from public, anon;
revoke all on function public.create_store(text, text, text, text, boolean) from public, anon;
revoke all on function public.clone_store(text, text, text, text, boolean) from public, anon;
grant execute on function public.apply_builder_draft(text, jsonb) to authenticated;
grant execute on function public.create_store_from_draft(text, text, text, text, jsonb) to authenticated;
grant execute on function public.create_store(text, text, text, text, boolean) to authenticated;
grant execute on function public.clone_store(text, text, text, text, boolean) to authenticated;
grant execute on function public.validate_coupon(text, text, numeric) to anon, authenticated;
grant execute on function public.submit_lead(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.store_is_open_now(public.stores) to anon, authenticated;
grant execute on function public.create_order(text, jsonb, jsonb) to anon, authenticated;
