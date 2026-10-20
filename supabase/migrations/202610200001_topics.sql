-- Lightweight research interests, separate from private proposals and article polls.
begin;

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 200),
  description text not null default '' check (char_length(description) <= 1500),
  submitter_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'open', 'planning', 'scheduled', 'discussed', 'archived')),
  -- Logical reference to a stable ID in src/data/schedule.json. The console
  -- offers only published meetings; no URL or private proposal data is stored.
  scheduled_meeting_id text check (
    scheduled_meeting_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+$'
    and char_length(scheduled_meeting_id) <= 200
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('scheduled', 'discussed') or scheduled_meeting_id is not null),
  check (status not in ('pending', 'open', 'planning') or scheduled_meeting_id is null)
);

create table public.topic_votes (
  topic_id uuid not null references public.topics(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (topic_id, voter_id)
);

create index topics_status_created_idx on public.topics(status, created_at desc);
create index topic_votes_voter_idx on public.topic_votes(voter_id);
create trigger topics_set_updated_at before update on public.topics
  for each row execute function private.set_updated_at();

alter table public.topics enable row level security;
alter table public.topic_votes enable row level security;
revoke all on public.topics, public.topic_votes from anon, authenticated;

grant select (id, title, description, status, scheduled_meeting_id, created_at, updated_at)
  on public.topics to authenticated;
grant insert (title, description, submitter_id) on public.topics to authenticated;
grant update (title, description, status, scheduled_meeting_id) on public.topics to authenticated;
grant select, delete on public.topic_votes to authenticated;
grant insert (topic_id, voter_id) on public.topic_votes to authenticated;

create policy "Members read approved topics and their pending submissions"
on public.topics for select to authenticated using (
  status in ('open', 'planning', 'scheduled', 'discussed')
  or (submitter_id = (select auth.uid()) and status = 'pending')
  or private.is_admin()
);
create policy "Emory members suggest topics for review"
on public.topics for insert to authenticated with check (
  private.is_emory_member() and submitter_id = (select auth.uid()) and status = 'pending'
);
create policy "Coordinators review topics"
on public.topics for update to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy "Members read only their own topic votes"
on public.topic_votes for select to authenticated
using (voter_id = (select auth.uid()) and private.is_emory_member());
create policy "Members upvote topics collecting interest"
on public.topic_votes for insert to authenticated with check (
  voter_id = (select auth.uid()) and private.is_emory_member()
  and exists (select 1 from public.topics t where t.id = topic_id and t.status in ('open', 'planning'))
);
create policy "Members remove their own active topic votes"
on public.topic_votes for delete to authenticated using (
  voter_id = (select auth.uid()) and private.is_emory_member()
  and exists (select 1 from public.topics t where t.id = topic_id and t.status in ('open', 'planning'))
);

-- Aggregate in the database, never disclose other members' voting records or
-- submitter IDs. This explicit projection also serves the coordinator board.
create function public.get_topics()
returns table (
  id uuid, title text, description text, status text, scheduled_meeting_id text,
  created_at timestamptz, interests bigint, is_interested boolean, is_owner boolean
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, t.description, t.status, t.scheduled_meeting_id, t.created_at,
    (select count(*) from public.topic_votes v where v.topic_id = t.id),
    exists (select 1 from public.topic_votes v where v.topic_id = t.id and v.voter_id = auth.uid()),
    coalesce(t.submitter_id = auth.uid(), false)
  from public.topics t
  where t.status in ('open', 'planning', 'scheduled', 'discussed')
    or (t.submitter_id = auth.uid() and t.status = 'pending')
    or private.is_admin()
  order by t.created_at desc, t.id;
$$;
revoke all on function public.get_topics() from public, anon, authenticated;
grant execute on function public.get_topics() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
