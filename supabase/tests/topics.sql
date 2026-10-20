-- Run only in the disposable database created by scripts/test-topics-db.py.
-- The bootstrap supplies Supabase roles and JWT helpers; policies are real SQL.
begin;
create function pg_temp.assert(ok boolean, reason text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %', reason; end if;
end $$;
create function pg_temp.expect_error(statement text, expected text) returns void
language plpgsql as $$ begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE % for %', expected, statement;
end $$;

insert into auth.users values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-000000000004');
insert into public.app_admins(email) values ('coordinator@emory.edu');
insert into public.topics(id,title,submitter_id,status) values
 ('10000000-0000-0000-0000-000000000001','Parameter reliability','00000000-0000-0000-0000-000000000001','open'),
 ('10000000-0000-0000-0000-000000000002','Beta pending','00000000-0000-0000-0000-000000000002','pending'),
 ('10000000-0000-0000-0000-000000000003','Clinical translation','00000000-0000-0000-0000-000000000001','planning'),
 ('10000000-0000-0000-0000-000000000004','Archived idea','00000000-0000-0000-0000-000000000001','archived');

set local role anon;
select pg_temp.assert((select count(*) = 2 from public.get_topics()), 'visitors see only approved topics');
select pg_temp.expect_error('select title from public.topics', '42501');
select pg_temp.expect_error('select * from public.topic_votes', '42501');
select pg_temp.expect_error($$insert into public.topics(title,submitter_id) values ('Anonymous idea','00000000-0000-0000-0000-000000000001')$$, '42501');
reset role;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","email":"alpha@emory.edu"}';
set local role authenticated;
insert into public.topics(title,description,submitter_id) values ('Alpha pending','Optional context','00000000-0000-0000-0000-000000000001');
select pg_temp.assert((select count(*) = 3 from public.get_topics()), 'members see only their own pending topics');
select pg_temp.assert((select count(*) = 0 from public.get_topics() where title = 'Beta pending'), 'pending topics stay private');
select pg_temp.expect_error('select submitter_id from public.topics', '42501');
select pg_temp.expect_error($$insert into public.topics(title,submitter_id,status) values ('Self approval','00000000-0000-0000-0000-000000000001','open')$$, '42501');
select pg_temp.expect_error($$insert into public.topics(title,submitter_id) values ('Forged author','00000000-0000-0000-0000-000000000002')$$, '42501');
select pg_temp.expect_error($$insert into public.topics(title,submitter_id) values ('   ','00000000-0000-0000-0000-000000000001')$$, '23514');
update public.topics set status = 'open' where title = 'Alpha pending';
select pg_temp.assert((select status = 'pending' from public.get_topics() where title = 'Alpha pending'), 'members cannot approve topics');
insert into public.topic_votes(topic_id,voter_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
select pg_temp.expect_error($$insert into public.topic_votes(topic_id,voter_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001')$$, '23505');
select pg_temp.expect_error($$insert into public.topic_votes(topic_id,voter_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')$$, '42501');
select pg_temp.expect_error($$insert into public.topic_votes(topic_id,voter_id) values ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001')$$, '42501');
select pg_temp.expect_error($$insert into public.topic_votes(topic_id,voter_id) values ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001')$$, '42501');
insert into public.topic_votes(topic_id,voter_id) values ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001');
reset role;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","email":"beta@emory.edu"}';
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.topic_votes), 'other members cannot read votes');
delete from public.topic_votes where topic_id = '10000000-0000-0000-0000-000000000001';
insert into public.topic_votes(topic_id,voter_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
select pg_temp.assert((select interests = 2 and is_interested from public.get_topics() where id = '10000000-0000-0000-0000-000000000001'), 'aggregate counts include both votes without exposing identities');
select pg_temp.assert((select count(*) = 1 from public.topic_votes), 'members can read only their own votes');
delete from public.topic_votes where topic_id = '10000000-0000-0000-0000-000000000001';
select pg_temp.assert((select interests = 1 and not is_interested from public.get_topics() where id = '10000000-0000-0000-0000-000000000001'), 'unvote updates count and personal state');
reset role;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003","email":"outsider@example.com"}';
set local role authenticated;
select pg_temp.expect_error($$insert into public.topics(title,submitter_id) values ('Outside suggestion','00000000-0000-0000-0000-000000000003')$$, '42501');
select pg_temp.expect_error($$insert into public.topic_votes(topic_id,voter_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003')$$, '42501');
reset role;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000004","email":"coordinator@emory.edu"}';
set local role authenticated;
select pg_temp.assert((select count(*) = 5 from public.get_topics()), 'coordinators see pending and archived topics');
update public.topics set title = 'Clarified question', status = 'open' where title = 'Beta pending';
select pg_temp.assert((select title = 'Clarified question' and status = 'open' from public.get_topics() where id = '10000000-0000-0000-0000-000000000002'), 'coordinators edit and approve');
select pg_temp.expect_error($$update public.topics set status = 'scheduled' where id = '10000000-0000-0000-0000-000000000001'$$, '23514');
select pg_temp.expect_error($$update public.topics set status = 'scheduled', scheduled_meeting_id = 'https://evil.example/' where id = '10000000-0000-0000-0000-000000000001'$$, '23514');
update public.topics set status = 'scheduled', scheduled_meeting_id = '2026-11-20-wip-2' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.assert((select scheduled_meeting_id = '2026-11-20-wip-2' and interests = 1 from public.get_topics() where id = '10000000-0000-0000-0000-000000000001'), 'scheduling preserves interest history and meeting ID');
reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","email":"alpha@emory.edu"}';
set local role authenticated;
select pg_temp.expect_error($$insert into public.topic_votes(topic_id,voter_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001')$$, '42501');
delete from public.topic_votes where topic_id = '10000000-0000-0000-0000-000000000001';
select pg_temp.assert((select interests = 1 from public.get_topics() where id = '10000000-0000-0000-0000-000000000001'), 'scheduled vote history is frozen');
reset role;

-- An article ballot remains independent from ongoing topic interest.
insert into public.article_suggestions(id,title,url,citation,topic,rationale,submitter_name,status)
values ('20000000-0000-0000-0000-000000000001','Example article','https://example.org/paper','Example citation','Methods','A useful discussion paper','Alpha','queued');
insert into public.polls(id,title,meeting_slot,closes_at,status,created_by)
values ('30000000-0000-0000-0000-000000000001','Article ballot','2026-12-04',now()+interval '1 day','open','00000000-0000-0000-0000-000000000004');
insert into public.poll_options(poll_id,article_id) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
set local role authenticated;
insert into public.poll_votes(poll_id,article_id,voter_id)
values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
select pg_temp.assert((select approvals = 1 from public.get_poll_results('30000000-0000-0000-0000-000000000001')), 'article voting still works');
select pg_temp.assert((select interests = 1 from public.get_topics() where id = '10000000-0000-0000-0000-000000000003'), 'topic interest remains independent');
reset role;
set local request.jwt.claims = '{}';
set local role anon;
select pg_temp.assert((select count(*) = 3 from public.get_topics()), 'only approved topics remain public');
select pg_temp.assert((select bool_and(not is_interested and not is_owner) from public.get_topics()), 'signed-out aggregate has no personal state');
select pg_temp.assert((select not (to_jsonb(t) ? 'submitter_id' or to_jsonb(t) ? 'voter_id') from public.get_topics() t limit 1), 'public projection omits user IDs');
reset role;
rollback;
