-- Disposable database only; run after the main Topics permission tests.
\ir ../migrations/202610200002_seed_meeting_topics.sql

do $$ begin
  if (select count(*) from public.topics) <> 5
    or exists (select 1 from public.topics where status <> 'open' or submitter_id is not null or scheduled_meeting_id is not null)
    or exists (select 1 from public.topic_votes)
  then raise exception 'Seed must add five open group topics without votes or meeting assignments'; end if;
end $$;

update public.topics set description = 'Coordinator revision'
where id = 'b1af0826-1009-4000-8000-000000000001';
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into public.topic_votes(topic_id,voter_id)
values ('b1af0826-1009-4000-8000-000000000001','00000000-0000-0000-0000-000000000001');
\ir ../migrations/202610200002_seed_meeting_topics.sql

do $$ begin
  if (select count(*) from public.topics) <> 5
    or not exists (select 1 from public.topics where id = 'b1af0826-1009-4000-8000-000000000001' and description = 'Coordinator revision')
    or (select count(*) from public.topic_votes) <> 1
  then raise exception 'Reseeding must preserve edits and votes without duplicates'; end if;
end $$;

set role anon;
do $$ begin
  if (select count(*) from public.get_topics()) <> 5
    or exists (select 1 from public.get_topics() where is_owner or is_interested)
  then raise exception 'Group topics must be public without personal attribution'; end if;
end $$;
reset role;

set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","email":"alpha@emory.edu"}';
set role authenticated;
do $$ begin
  begin
    insert into public.topics(title,submitter_id) values ('Cannot submit without an owner',null);
  exception when insufficient_privilege then return;
  end;
  raise exception 'Members must still provide their own submitter ID';
end $$;
reset role;
