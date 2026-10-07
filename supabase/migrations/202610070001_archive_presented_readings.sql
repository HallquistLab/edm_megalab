-- Preserve past discussions while removing them from pending and current queues.
-- These papers were discussed at the September 25, 2026 meeting.
update public.article_suggestions
set status = 'archived'
where status in ('pending', 'queued', 'selected')
  and (
    lower(url) ~ '(10\.1038/s41562-024-01814-x|10\.3758/s13423-024-02490-8)([/?#].*)?$'
    or lower(trim(title)) in (
      'dynamic computational phenotyping of human cognition',
      'does the reliability of computational models truly improve with hierarchical modeling? some recommendations and considerations for the assessment of model parameter reliability'
    )
  );
