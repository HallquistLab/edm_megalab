-- Emory Decision-Making Megalab community queue and approval polls.
-- Apply to a dedicated Supabase project. Browser clients use only the
-- publishable key; authorization is enforced here with RLS.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.app_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table public.article_suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 300),
  url text not null check (url ~ '^https?://'),
  citation text not null check (char_length(citation) between 3 and 1000),
  topic text not null check (char_length(topic) between 2 and 120),
  rationale text not null check (char_length(rationale) between 10 and 3000),
  questions text not null default '' check (char_length(questions) <= 3000),
  submitter_id uuid references auth.users(id) on delete cascade,
  submitter_name text not null check (char_length(submitter_name) between 2 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'selected', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 200),
  meeting_slot text not null check (char_length(meeting_slot) between 2 and 200),
  closes_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  max_approvals smallint not null default 3 check (max_approvals between 1 and 5),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.poll_options (
  poll_id uuid not null references public.polls(id) on delete cascade,
  article_id uuid not null references public.article_suggestions(id) on delete cascade,
  position smallint not null default 0,
  primary key (poll_id, article_id)
);

create table public.poll_votes (
  poll_id uuid not null,
  article_id uuid not null,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, article_id, voter_id),
  foreign key (poll_id, article_id)
    references public.poll_options(poll_id, article_id) on delete cascade
);

create index article_suggestions_status_created_idx
  on public.article_suggestions(status, created_at desc);
create unique index article_suggestions_url_unique_idx
  on public.article_suggestions(lower(url));
create index polls_status_closes_idx on public.polls(status, closes_at desc);
create unique index polls_single_open_idx on public.polls(status)
  where status = 'open';
create index poll_votes_poll_idx on public.poll_votes(poll_id);
create index poll_votes_voter_idx on public.poll_votes(voter_id, poll_id);

create or replace function private.is_emory_member()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@emory.edu', false);
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_admins
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger article_suggestions_set_updated_at
before update on public.article_suggestions
for each row execute function private.set_updated_at();

create trigger polls_set_updated_at
before update on public.polls
for each row execute function private.set_updated_at();

create or replace function private.enforce_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed smallint;
begin
  if auth.uid() is null or auth.uid() <> new.voter_id then
    raise exception 'Votes must belong to the signed-in member';
  end if;

  if not private.is_emory_member() then
    raise exception 'Voting is limited to Emory members';
  end if;

  select p.max_approvals
    into allowed
  from public.polls p
  where p.id = new.poll_id
    and p.status = 'open'
    and p.closes_at > now();

  if allowed is null then
    raise exception 'This poll is not open';
  end if;

  if (
    select count(*)
    from public.poll_votes v
    where v.poll_id = new.poll_id and v.voter_id = new.voter_id
  ) >= allowed then
    raise exception 'This ballot has reached its approval limit';
  end if;

  return new;
end;
$$;

create trigger poll_votes_enforce_limit
before insert on public.poll_votes
for each row execute function private.enforce_poll_vote();

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;

create or replace function public.get_poll_results(p_poll_id uuid)
returns table (article_id uuid, approvals bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.article_id, count(v.voter_id)::bigint as approvals
  from public.poll_options o
  join public.polls p on p.id = o.poll_id
  left join public.poll_votes v
    on v.poll_id = o.poll_id and v.article_id = o.article_id
  where o.poll_id = p_poll_id
    and p.status in ('open', 'closed')
  group by o.article_id, o.position
  order by approvals desc, o.position asc;
$$;

create or replace function public.create_poll(
  p_title text,
  p_meeting_slot text,
  p_closes_at timestamptz,
  p_max_approvals smallint,
  p_article_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_poll_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Coordinator access required';
  end if;

  if coalesce(array_length(p_article_ids, 1), 0) < 2
    or array_length(p_article_ids, 1) > 8 then
    raise exception 'Choose between two and eight articles';
  end if;

  if p_closes_at <= now() then
    raise exception 'The poll closing time must be in the future';
  end if;

  if exists (
    select 1
    from unnest(p_article_ids) as requested(article_id)
    left join public.article_suggestions a on a.id = requested.article_id
    where a.id is null or a.status not in ('queued', 'selected')
  ) then
    raise exception 'Every poll option must be a queued article';
  end if;

  insert into public.polls (
    title, meeting_slot, closes_at, max_approvals, status, created_by
  ) values (
    p_title, p_meeting_slot, p_closes_at, p_max_approvals, 'open', auth.uid()
  ) returning id into new_poll_id;

  insert into public.poll_options (poll_id, article_id, position)
  select new_poll_id, article_id, ordinal::smallint
  from unnest(p_article_ids) with ordinality as choices(article_id, ordinal);

  return new_poll_id;
end;
$$;

revoke all on function public.is_current_user_admin() from public;
revoke all on function public.get_poll_results(uuid) from public;
revoke all on function public.create_poll(text, text, timestamptz, smallint, uuid[]) from public;
grant execute on function public.is_current_user_admin() to authenticated;
grant execute on function public.get_poll_results(uuid) to anon, authenticated;
grant execute on function public.create_poll(text, text, timestamptz, smallint, uuid[])
  to authenticated;

alter table public.app_admins enable row level security;
alter table public.article_suggestions enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

revoke all on table public.app_admins from anon, authenticated;
revoke all on table public.article_suggestions from anon, authenticated;
revoke all on table public.polls from anon, authenticated;
revoke all on table public.poll_options from anon, authenticated;
revoke all on table public.poll_votes from anon, authenticated;

grant select (
  id, title, url, citation, topic, rationale, questions, submitter_name,
  status, created_at, updated_at
) on public.article_suggestions to anon;
grant select (
  id, title, meeting_slot, closes_at, status, max_approvals, created_at, updated_at
) on public.polls to anon;
grant select on public.poll_options to anon;
grant select on public.article_suggestions, public.polls, public.poll_options
  to authenticated;
grant insert, update, delete on public.article_suggestions, public.polls, public.poll_options
  to authenticated;
grant select, insert, delete on public.poll_votes to authenticated;
grant select on public.app_admins to authenticated;

create policy "Public suggestions are readable"
on public.article_suggestions for select
to anon
using (status in ('queued', 'selected'));

create policy "Members see public and their own suggestions"
on public.article_suggestions for select
to authenticated
using (
  status in ('queued', 'selected')
  or submitter_id = auth.uid()
  or private.is_admin()
);

create policy "Emory members submit suggestions"
on public.article_suggestions for insert
to authenticated
with check (
  private.is_emory_member()
  and submitter_id = auth.uid()
  and status = 'pending'
);

create policy "Admins update suggestions"
on public.article_suggestions for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "Admins delete suggestions"
on public.article_suggestions for delete
to authenticated
using (private.is_admin());

create policy "Public polls are readable"
on public.polls for select
to anon
using (status in ('open', 'closed'));

create policy "Members see public polls"
on public.polls for select
to authenticated
using (status in ('open', 'closed') or private.is_admin());

create policy "Admins create polls"
on public.polls for insert
to authenticated
with check (private.is_admin() and created_by = auth.uid());

create policy "Admins update polls"
on public.polls for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "Admins delete polls"
on public.polls for delete
to authenticated
using (private.is_admin());

create policy "Visible poll options are readable"
on public.poll_options for select
to anon, authenticated
using (
  exists (
    select 1 from public.polls p
    where p.id = poll_id and p.status in ('open', 'closed')
  )
  or private.is_admin()
);

create policy "Admins create poll options"
on public.poll_options for insert
to authenticated
with check (private.is_admin());

create policy "Admins update poll options"
on public.poll_options for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "Admins delete poll options"
on public.poll_options for delete
to authenticated
using (private.is_admin());

create policy "Members add their own votes"
on public.poll_votes for insert
to authenticated
with check (voter_id = auth.uid() and private.is_emory_member());

create policy "Members remove their own open-poll votes"
on public.poll_votes for delete
to authenticated
using (
  voter_id = auth.uid()
  and exists (
    select 1 from public.polls p
    where p.id = poll_id and p.status = 'open' and p.closes_at > now()
  )
);

create policy "Members see their own votes and admins inspect votes"
on public.poll_votes for select
to authenticated
using (voter_id = auth.uid() or private.is_admin());

create policy "Admins can see the admin list"
on public.app_admins for select
to authenticated
using (private.is_admin());

-- Seed the first coordinator after applying this migration:
-- insert into public.app_admins (email) values ('coordinator@emory.edu');
