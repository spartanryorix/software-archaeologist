-- Software Archaeologist — Supabase schema (run once in the SQL Editor).
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  recovery_mode text not null default 'repair',
  goals jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  confidence_level integer not null default 0,
  source_type text,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null,
  filename text not null,
  size_bytes bigint not null default 0,
  storage_path text,
  content_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  detected_languages jsonb not null default '[]'::jsonb,
  detected_frameworks jsonb not null default '[]'::jsonb,
  build_systems jsonb not null default '[]'::jsonb,
  dependency_graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  missing_assets jsonb not null default '[]'::jsonb,
  safety_risks jsonb not null default '[]'::jsonb,
  era jsonb,
  confidence double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  env_type text,
  runtime text,
  runtime_version text,
  base_image text,
  base_image_digest text,
  packages jsonb not null default '[]'::jsonb,
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  step_order integer not null default 0,
  title text not null,
  description text,
  action_type text,
  safety_guard text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.blockers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  category text,
  severity text,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  resolution text,
  created_at timestamptz not null default now()
);

create table if not exists public.executions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'pending',
  started_at timestamptz,
  ended_at timestamptz,
  result text,
  iterations_used integer not null default 0,
  budget integer not null default 5,
  created_at timestamptz not null default now()
);

-- clock_timestamp() so rows inserted in one statement keep their order
create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.executions(id) on delete cascade,
  ts timestamptz not null default clock_timestamp(),
  level text not null default 'info',
  phase text,
  message text not null
);

create table if not exists public.patches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  diff text not null,
  rationale text,
  reversible boolean not null default true,
  applied_at timestamptz not null default now()
);

create table if not exists public.verification_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  level integer not null,
  name text not null,
  criteria text,
  status text not null default 'unknown',
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  version text,
  source text,
  checksum text,
  license text,
  redistributable boolean not null default false,
  status text not null default 'missing',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  ts timestamptz not null default clock_timestamp(),
  phase text,
  type text,
  summary text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  storage_path text,
  format text not null default 'zip'
);

create index if not exists idx_projects_user on public.projects(user_id);
create index if not exists idx_artifacts_project on public.artifacts(project_id);
create index if not exists idx_analyses_project on public.analyses(project_id);
create index if not exists idx_environments_project on public.environments(project_id);
create index if not exists idx_plan_steps_project on public.plan_steps(project_id);
create index if not exists idx_blockers_project on public.blockers(project_id);
create index if not exists idx_executions_project on public.executions(project_id);
create index if not exists idx_logs_execution on public.execution_logs(execution_id, ts);
create index if not exists idx_patches_project on public.patches(project_id);
create index if not exists idx_verification_project on public.verification_results(project_id);
create index if not exists idx_dependencies_project on public.dependencies(project_id);
create index if not exists idx_audit_project on public.audit_events(project_id, ts);
create index if not exists idx_exports_project on public.exports(project_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------------- Row Level Security: each user sees only their own data ----------------
alter table public.projects enable row level security;
drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['artifacts','analyses','environments','plan_steps','blockers','executions',
                           'patches','verification_results','dependencies','audit_events','exports']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format($p$create policy "own rows" on public.%I for all to authenticated
      using (exists (select 1 from public.projects p where p.id = %I.project_id and p.user_id = (select auth.uid())))
      with check (exists (select 1 from public.projects p where p.id = %I.project_id and p.user_id = (select auth.uid())))$p$, t, t, t);
  end loop;
end $$;

alter table public.execution_logs enable row level security;
drop policy if exists "own logs" on public.execution_logs;
create policy "own logs" on public.execution_logs for all to authenticated
  using (exists (select 1 from public.executions e join public.projects p on p.id = e.project_id
                 where e.id = execution_logs.execution_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.executions e join public.projects p on p.id = e.project_id
                 where e.id = execution_logs.execution_id and p.user_id = (select auth.uid())));

-- ---------------- Storage: private buckets, files live under <user id>/... ----------------
insert into storage.buckets (id, name, public) values ('artifacts', 'artifacts', false), ('exports', 'exports', false)
  on conflict (id) do nothing;

drop policy if exists "own storage objects" on storage.objects;
create policy "own storage objects" on storage.objects for all to authenticated
  using (bucket_id in ('artifacts', 'exports') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('artifacts', 'exports') and (storage.foldername(name))[1] = (select auth.uid())::text);
