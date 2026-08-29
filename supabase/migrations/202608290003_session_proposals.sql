-- Private session proposals submitted from the public site and reviewed by coordinators.

create table public.session_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_type text not null
    check (proposal_type in ('work_in_progress', 'current_topic_or_workshop')),
  submitter_name text not null check (char_length(submitter_name) between 2 and 120),
  contact_email text not null check (
    char_length(contact_email) between 3 and 254
    and contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  working_title text not null check (char_length(working_title) between 3 and 200),

  -- Work-in-progress agenda fields.
  project_stage text not null default '' check (char_length(project_stage) <= 300),
  scientific_question text not null default ''
    check (char_length(scientific_question) <= 1000),
  session_goals text not null default '' check (char_length(session_goals) <= 2000),
  material_to_share text not null default ''
    check (char_length(material_to_share) <= 1500),
  discussion_preference text not null default '' check (
    discussion_preference in ('', 'interruptions_welcome', 'clarifications_only', 'hold_questions')
  ),
  useful_expertise text not null default '' check (char_length(useful_expertise) <= 1000),
  sharing_constraints text not null default ''
    check (char_length(sharing_constraints) <= 1000),

  -- Current-topic discussion or workshop fields.
  topic_summary text not null default '' check (char_length(topic_summary) <= 1500),
  relevance text not null default '' check (char_length(relevance) <= 1500),
  desired_outcomes text not null default '' check (char_length(desired_outcomes) <= 1500),
  suggested_format text not null default ''
    check (suggested_format in ('', 'discussion', 'workshop', 'mixed')),
  proposed_lead text not null default '' check (char_length(proposed_lead) <= 300),
  preparation_notes text not null default '' check (char_length(preparation_notes) <= 1000),

  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    (
      proposal_type = 'work_in_progress'
      and char_length(project_stage) >= 2
      and char_length(scientific_question) >= 10
      and char_length(session_goals) >= 10
      and discussion_preference <> ''
    )
    or
    (
      proposal_type = 'current_topic_or_workshop'
      and char_length(topic_summary) >= 10
      and char_length(relevance) >= 10
      and char_length(desired_outcomes) >= 10
      and suggested_format <> ''
    )
  )
);

create index session_proposals_status_created_idx
  on public.session_proposals(status, created_at desc);

create trigger session_proposals_set_updated_at
before update on public.session_proposals
for each row execute function private.set_updated_at();

alter table public.session_proposals enable row level security;

revoke all on table public.session_proposals from anon, authenticated;

grant insert (
  proposal_type, submitter_name, contact_email, working_title,
  project_stage, scientific_question, session_goals, material_to_share,
  discussion_preference, useful_expertise, sharing_constraints,
  topic_summary, relevance, desired_outcomes, suggested_format,
  proposed_lead, preparation_notes
) on public.session_proposals to anon, authenticated;

grant select, update, delete on public.session_proposals to authenticated;

create policy "Anyone can submit a session proposal"
on public.session_proposals for insert
to anon, authenticated
with check (status = 'active');

create policy "Admins can read session proposals"
on public.session_proposals for select
to authenticated
using (private.is_admin());

create policy "Admins can update session proposals"
on public.session_proposals for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "Admins can delete session proposals"
on public.session_proposals for delete
to authenticated
using (private.is_admin());
