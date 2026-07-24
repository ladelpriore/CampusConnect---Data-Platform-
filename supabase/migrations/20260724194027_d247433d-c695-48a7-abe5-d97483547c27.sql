
ALTER TABLE public.validation_errors
  ADD COLUMN IF NOT EXISTS import_job_id uuid,
  ADD COLUMN IF NOT EXISTS row_number integer,
  ADD COLUMN IF NOT EXISTS field text,
  ADD COLUMN IF NOT EXISTS submitted_value text;

CREATE TABLE IF NOT EXISTS public.quality_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completeness_pct integer NOT NULL,
  duplicate_rate_pct integer NOT NULL,
  trigger text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_snapshots TO authenticated;
GRANT ALL ON public.quality_snapshots TO service_role;
ALTER TABLE public.quality_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all quality_snapshots" ON public.quality_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.quality_snapshots (completeness_pct, duplicate_rate_pct, trigger, note, created_at)
VALUES
  (74, 16, 'baseline', 'Initial import from Banner + Slate', now() - interval '7 days'),
  (81, 12, 'baseline', 'After first CRM sync', now() - interval '2 days');
