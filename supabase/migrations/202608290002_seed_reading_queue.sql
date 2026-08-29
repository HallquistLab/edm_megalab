-- Allow coordinator-curated seed readings without impersonating an auth user.
-- Member submissions remain constrained to auth.uid() by the insert RLS policy.
alter table public.article_suggestions alter column submitter_id drop not null;

create unique index if not exists article_suggestions_url_unique_idx
  on public.article_suggestions(lower(url));

insert into public.article_suggestions (
  title, url, citation, topic, rationale, questions,
  submitter_id, submitter_name, status
)
values
  (
    'Dynamic computational phenotyping of human cognition',
    'https://doi.org/10.1038/s41562-024-01814-x',
    'Schurr, Reznik, Hillman, Bhui, et al. · Nature Human Behaviour · 2024',
    'Measurement',
    'Repeated measurement reveals meaningful differences in parameter stability and systematic temporal change—a strong bridge across computational psychiatry, individual differences, and decision science.',
    '', null, 'Megalab reading list', 'queued'
  ),
  (
    'Disentangling sources of variability in decision-making',
    'https://doi.org/10.1038/s41583-025-00916-3',
    'Duffy, Bellgrove, Murphy, et al. · Nature Reviews Neuroscience · 2025',
    'Variability',
    'A shared vocabulary for latent states, evidence accumulation, neural dynamics, and psychiatric phenotypes.',
    '', null, 'Megalab reading list', 'queued'
  ),
  (
    'Compulsivity is linked to suboptimal choice variability but unaltered reinforcement learning under uncertainty',
    'https://doi.org/10.1038/s44220-024-00364-5',
    'Lee, Rouault & Wyart · Nature Mental Health · 2025',
    'Psychopathology',
    'A clean computational-psychiatry example that separates variability in learning from variability in choice.',
    '', null, 'Megalab reading list', 'queued'
  ),
  (
    'Schemas, reinforcement learning and the medial prefrontal cortex',
    'https://doi.org/10.1038/s41583-024-00893-z',
    'Bein & Niv · Nature Reviews Neuroscience · 2025',
    'Reinforcement learning',
    'An integrative treatment of schemas, latent states, reinforcement learning, memory, and medial prefrontal function.',
    '', null, 'Megalab reading list', 'queued'
  ),
  (
    'A neural mechanism for conserved value computations integrating information and rewards',
    'https://doi.org/10.1038/s41593-023-01511-4',
    'Bromberg-Martin et al. · Nature Neuroscience · 2024',
    'Value',
    'A cross-species account of information value, reward, uncertainty, exploration, and lateral habenula.',
    '', null, 'Megalab reading list', 'queued'
  ),
  (
    'Distributional reinforcement learning in prefrontal cortex',
    'https://doi.org/10.1038/s41593-023-01535-w',
    'Multiple authors · Nature Neuroscience · 2024',
    'Reinforcement learning',
    'An entry point into richer representations of outcome distributions, risk-sensitive behavior, and individual differences.',
    '', null, 'Megalab reading list', 'queued'
  ),
  (
    'Humans adaptively deploy forward and backward prediction',
    'https://doi.org/10.1038/s41562-024-01930-8',
    'Sharp & Eldar · Nature Human Behaviour · 2024',
    'Planning',
    'A discussion starter for model-based cognition, representation, planning, and when different computational strategies are rational.',
    '', null, 'Megalab reading list', 'queued'
  )
on conflict do nothing;
