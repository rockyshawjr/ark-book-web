-- Ark-Book limited keys. Only hashes are stored. RLS on with no policies, so only the service role (the edge function) can read or write.
create table if not exists public.ark_keys(
 id uuid primary key default gen_random_uuid(),
 key_hash text not null unique,
 label text not null,
 role text not null check (role in ('crew','viewer')),
 created_at timestamptz not null default now(),
 last_used timestamptz,
 revoked_at timestamptz);
alter table public.ark_keys enable row level security;
revoke all on public.ark_keys from anon, authenticated;
