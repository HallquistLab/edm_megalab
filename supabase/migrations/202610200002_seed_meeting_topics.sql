-- Coordinator-curated topics drawn from the October 9, 2026 meeting notes.
-- Use no personal submitter for group suggestions, matching the reading seed.
-- Member insert policies still require submitter_id = auth.uid().
begin;

alter table public.topics alter column submitter_id drop not null;

insert into public.topics (id, title, description, submitter_id, status)
values
  (
    'b1af0826-1009-4000-8000-000000000001',
    'Clinical translation and public health relevance of decision neuroscience',
    'Where do findings in decision neuroscience connect to clinical practice and public health, and what limits their translation? Raised at the October 9 meeting.',
    null, 'open'
  ),
  (
    'b1af0826-1009-4000-8000-000000000002',
    'How different labs approach the same scientific question',
    'Compare how labs frame a shared research question and choose among different experimental or analytical approaches. Raised at the October 9 meeting.',
    null, 'open'
  ),
  (
    'b1af0826-1009-4000-8000-000000000003',
    'From scientific question to study design and analysis',
    'Discuss concrete examples of translating a scientific question into a study design and analysis plan, including the tradeoffs along the way. Raised at the October 9 meeting.',
    null, 'open'
  ),
  (
    'b1af0826-1009-4000-8000-000000000004',
    'Comparing applications and misuses of research methods',
    'Compare published applications of a method, including examples where it was poorly used, to clarify when it is useful and what can go wrong. Raised at the October 9 meeting.',
    null, 'open'
  ),
  (
    'b1af0826-1009-4000-8000-000000000005',
    'Developing and communicating grant proposal ideas',
    'Discuss how to frame a scientific question and communicate an approach in a grant proposal, using short excerpts when a contributor is ready to share. Raised at the October 9 meeting.',
    null, 'open'
  )
-- Reapplying the seed preserves coordinator edits, status changes, and votes.
on conflict (id) do nothing;

commit;
