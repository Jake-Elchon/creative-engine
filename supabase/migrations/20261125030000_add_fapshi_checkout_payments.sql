-- Only new, Fapshi-enabled checkouts receive a provider row. Preexisting
-- checkout test records stay readable and cannot trigger a surprise prompt.
create table cimfest.fapshi_payments (
    transaction_id uuid primary key references cimfest.checkout_intents (transaction_id),
    provider_trans_id text unique,
    provider_status text check (provider_status in ('CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED')),
    dispatch_rejected boolean not null default false,
    next_check_at timestamptz not null default (now() + interval '15 seconds'),
    check (provider_status is null or provider_trans_id is not null),
    check (not dispatch_rejected or provider_trans_id is null)
);

revoke all on cimfest.fapshi_payments from public, anon, authenticated, service_role;
