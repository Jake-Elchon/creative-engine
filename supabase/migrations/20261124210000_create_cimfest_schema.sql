create schema cimfest;

revoke all on schema cimfest from public, anon, authenticated, service_role;

create table cimfest.users (
    id uuid primary key references auth.users (id),
    email varchar(120) not null check (btrim(email) <> ''),
    full_name varchar(100) not null,
    preferred_lang char(2),
    registered_at timestamptz not null default now()
);

create unique index users_email_key on cimfest.users (lower(email));

create table cimfest.currencies (
    id uuid primary key default gen_random_uuid(),
    code char(3) not null unique check (code ~ '^[A-Z]{3}$'),
    name varchar(5) not null
);

create table cimfest.product_types (
    id uuid primary key default gen_random_uuid(),
    type varchar(12) not null unique,
    name varchar(50) not null
);

create table cimfest.transaction_statuses (
    id uuid primary key default gen_random_uuid(),
    status varchar(10) not null unique
);

create table cimfest.payment_accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references cimfest.users (id),
    payout_phone varchar(16) not null check (payout_phone ~ '^\+[1-9][0-9]{1,14}$'),
    is_default boolean not null default false
);

create index payment_accounts_user_id_idx on cimfest.payment_accounts (user_id);
create unique index payment_accounts_default_user_key
    on cimfest.payment_accounts (user_id) where is_default;

create table cimfest.payment_methods (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references cimfest.payment_accounts (id),
    method varchar(12) not null,
    unique (account_id, method)
);

create table cimfest.storefronts (
    id uuid primary key default gen_random_uuid(),
    creator_id uuid not null references cimfest.users (id),
    handle varchar(30) not null check (btrim(handle) <> ''),
    display_name varchar(80) not null,
    bio varchar(100)
);

create index storefronts_creator_id_idx on cimfest.storefronts (creator_id);
create unique index storefronts_handle_key on cimfest.storefronts (lower(handle));

create table cimfest.products (
    id uuid primary key default gen_random_uuid(),
    storefront_id uuid not null references cimfest.storefronts (id),
    type_id uuid not null references cimfest.product_types (id),
    description varchar(120),
    master_file_key varchar(255) not null,
    preview_file_key varchar(255)
);

create index products_storefront_id_idx on cimfest.products (storefront_id);
create index products_type_id_idx on cimfest.products (type_id);

create table cimfest.product_prices (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references cimfest.products (id),
    currency_code char(3) not null references cimfest.currencies (code),
    amount_minor bigint not null check (amount_minor >= 0),
    unique (product_id, currency_code)
);

create index product_prices_currency_code_idx on cimfest.product_prices (currency_code);

create table cimfest.transactions (
    id uuid primary key default gen_random_uuid(),
    idempotency_key varchar(64) not null unique check (btrim(idempotency_key) <> ''),
    buyer_id uuid references cimfest.users (id),
    method_id uuid not null references cimfest.payment_methods (id),
    currency_code char(3) not null references cimfest.currencies (code),
    status_id uuid not null references cimfest.transaction_statuses (id),
    gross_amount_minor bigint not null check (gross_amount_minor >= 0),
    settled_amount_minor bigint check (settled_amount_minor >= 0),
    platform_fee_minor bigint check (platform_fee_minor >= 0),
    gateway_fee_minor bigint check (gateway_fee_minor >= 0),
    created_at timestamptz not null default now(),
    confirmed_at timestamptz check (confirmed_at >= created_at),
    is_registered_buyer boolean generated always as (buyer_id is not null) stored
);

create index transactions_buyer_id_idx on cimfest.transactions (buyer_id);
create index transactions_method_id_idx on cimfest.transactions (method_id);
create index transactions_currency_code_idx on cimfest.transactions (currency_code);
create index transactions_status_id_idx on cimfest.transactions (status_id);

create table cimfest.transaction_items (
    transaction_id uuid not null references cimfest.transactions (id),
    product_id uuid not null references cimfest.products (id),
    amount_minor bigint not null check (amount_minor >= 0),
    primary key (transaction_id, product_id)
);

create index transaction_items_product_id_idx on cimfest.transaction_items (product_id);

create table cimfest.groups (
    id uuid primary key default gen_random_uuid(),
    group_name varchar(40) not null
);

create table cimfest.group_founders (
    group_id uuid not null references cimfest.groups (id) on delete cascade,
    user_id uuid not null references cimfest.users (id),
    primary key (group_id, user_id)
);

create index group_founders_user_id_idx on cimfest.group_founders (user_id);

create table cimfest.split_sheets (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references cimfest.products (id),
    group_id uuid references cimfest.groups (id),
    invitee_id uuid references cimfest.users (id),
    completed boolean not null default false
);

create index split_sheets_product_id_idx on cimfest.split_sheets (product_id);
create index split_sheets_group_id_idx on cimfest.split_sheets (group_id);
create index split_sheets_invitee_id_idx on cimfest.split_sheets (invitee_id);

create table cimfest.split_sheet_collaborators (
    split_sheet_id uuid not null references cimfest.split_sheets (id) on delete cascade,
    user_id uuid not null references cimfest.users (id),
    share_percent numeric(5, 2) not null check (share_percent > 0 and share_percent <= 100),
    primary key (split_sheet_id, user_id)
);

create index split_sheet_collaborators_user_id_idx
    on cimfest.split_sheet_collaborators (user_id);

revoke all on all tables in schema cimfest from public, anon, authenticated, service_role;
