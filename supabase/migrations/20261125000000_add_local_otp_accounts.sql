-- Local OTP profiles are separate from Supabase Auth identities.
alter table cimfest.users
    drop constraint users_id_fkey,
    add column local_otp_phone varchar(13) unique
        check (local_otp_phone ~ '^\+237[0-9]{9}$'),
    add column supabase_user_id uuid generated always as (
        case when local_otp_phone is null then id end
    ) stored references auth.users (id);

create index users_supabase_user_id_idx on cimfest.users (supabase_user_id);

create table cimfest.local_otp_sessions (
    access_token_hash bytea primary key,
    refresh_token_hash bytea not null unique,
    user_id uuid not null references cimfest.users (id) on delete cascade,
    access_expires_at timestamptz not null,
    refresh_expires_at timestamptz not null
);

create index local_otp_sessions_refresh_expiry_idx on cimfest.local_otp_sessions (refresh_expires_at);
revoke all on cimfest.local_otp_sessions from public, anon, authenticated, service_role;
