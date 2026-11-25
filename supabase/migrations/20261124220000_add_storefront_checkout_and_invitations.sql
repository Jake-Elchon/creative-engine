-- Keep the existing split history and enforce one active version per product.
alter table cimfest.split_sheets add column active boolean not null default false;
update cimfest.split_sheets
set active = true
where id in (
    select distinct on (product_id) id
    from cimfest.split_sheets
    order by product_id, completed desc, id
);
alter table cimfest.split_sheets alter column active set default true;
create unique index split_sheets_active_product_key on cimfest.split_sheets (product_id) where active;
create index products_storefront_page_idx on cimfest.products (storefront_id, id);

insert into cimfest.currencies (code, name) values
    ('XAF', 'XAF'), ('EUR', 'EUR'), ('USD', 'USD')
on conflict (code) do nothing;
insert into cimfest.transaction_statuses (status) values ('PENDING'), ('SUCCESS'), ('FAILED')
on conflict (status) do nothing;

-- Frozen checkout inputs and the original response for idempotent retries.
create table cimfest.checkout_intents (
    transaction_id uuid primary key references cimfest.transactions (id),
    request_hash bytea not null,
    buyer_phone varchar(13) not null,
    buyer_email varchar(120) not null,
    split_id uuid references cimfest.split_sheets (id),
    beneficiary_snapshot jsonb not null,
    replay_response jsonb not null,
    guest_token_hash bytea,
    guest_expires_at timestamptz,
    check ((guest_token_hash is null) = (guest_expires_at is null))
);

create table cimfest.split_invitations (
    id uuid primary key,
    split_id uuid not null references cimfest.split_sheets (id),
    invited_phone varchar(13) not null check (invited_phone ~ '^\+237[0-9]{9}$'),
    share_bps integer not null check (share_bps between 1 and 10000),
    collaborator_user_id uuid references cimfest.users (id),
    status text not null check (status in ('PENDING', 'ACCEPTED', 'REJECTED')),
    token_hash bytea,
    expires_at timestamptz not null,
    decided_at timestamptz,
    unique (split_id, invited_phone),
    unique (split_id, collaborator_user_id)
);

create table cimfest.split_replays (
    creator_id uuid not null references cimfest.users (id),
    product_id uuid not null references cimfest.products (id),
    idempotency_key varchar(64) not null,
    request_hash bytea not null,
    response jsonb not null,
    primary key (creator_id, product_id, idempotency_key)
);

-- A message worker can consume committed jobs and record delivery for retries.
create table cimfest.invitation_delivery_jobs (
    invitation_id uuid primary key references cimfest.split_invitations (id),
    language char(2) not null,
    created_at timestamptz not null default now(),
    delivered_at timestamptz
);

revoke all on cimfest.checkout_intents, cimfest.split_invitations, cimfest.split_replays,
    cimfest.invitation_delivery_jobs from public, anon, authenticated, service_role;
