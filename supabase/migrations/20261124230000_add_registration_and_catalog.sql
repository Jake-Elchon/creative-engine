-- GoTrue manages the verified phone and OTP secret. Keep the API's per-phone
-- limits and challenge lifetime here so they apply across FastAPI workers.
alter table cimfest.users alter column email drop not null;

create table cimfest.otp_challenges (
    phone varchar(13) primary key check (phone ~ '^\+237[0-9]{9}$'),
    requested_at timestamptz[] not null default '{}',
    expires_at timestamptz,
    attempts smallint not null default 0 check (attempts between 0 and 5)
);

-- Media approval occurs upstream of product creation. Private masters and
-- public previews have separate purposes even when owned by the same creator.
create table cimfest.catalog_assets (
    file_key varchar(255) primary key check (btrim(file_key) <> ''),
    creator_id uuid not null references cimfest.users (id),
    kind text not null check (kind in ('master', 'preview')),
    approved_at timestamptz
);

alter table cimfest.product_types add column requires_master_file boolean not null default true;
alter table cimfest.products alter column master_file_key drop not null;

insert into cimfest.product_types (type, name, requires_master_file) values
    ('release', 'Release', true),
    ('video', 'Video', true),
    ('ebook', 'E-book', true),
    ('tip', 'Tip', false),
    ('shoutout', 'Shoutout', false)
on conflict (type) do update set requires_master_file = excluded.requires_master_file;

-- Keyset ordering for browse and trigram indexes for infix search.
create index storefronts_discovery_order_idx on cimfest.storefronts (lower(btrim(display_name)), id);
create extension if not exists pg_trgm with schema extensions;
-- An existing pg_trgm installation can live in a schema other than extensions.
do $$
declare
    extension_schema name;
begin
    select n.nspname into extension_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm';
    execute format(
        'create index storefronts_discovery_name_trgm_idx on cimfest.storefronts
         using gin (lower(btrim(display_name)) %I.gin_trgm_ops)', extension_schema
    );
    execute format(
        'create index storefronts_discovery_handle_trgm_idx on cimfest.storefronts
         using gin (lower(handle) %I.gin_trgm_ops)', extension_schema
    );
end $$;

revoke all on cimfest.otp_challenges, cimfest.catalog_assets from public, anon, authenticated, service_role;
