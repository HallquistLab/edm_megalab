#!/usr/bin/env python3
"""Exercise Topics permissions in a disposable PostgreSQL cluster (no network listener)."""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
for command in ('initdb', 'pg_ctl', 'psql'):
    if not shutil.which(command):
        raise SystemExit(f'{command} is required; install PostgreSQL to run database tests.')

with tempfile.TemporaryDirectory(prefix='edm-topics-', dir='/tmp') as directory:
    cluster = Path(directory) / 'data'
    log = Path(directory) / 'postgres.log'
    initialized = subprocess.run(['initdb', '-D', str(cluster), '-A', 'trust', '--no-locale', '-E', 'UTF8'], capture_output=True, text=True)
    if initialized.returncode:
        raise SystemExit(initialized.stdout + initialized.stderr)
    started = False
    try:
        startup = subprocess.run(['pg_ctl', '-D', str(cluster), '-l', str(log), '-o', f"-F -c listen_addresses='' -c unix_socket_directories='{directory}' -p 55437", '-w', 'start'], capture_output=True, text=True)
        if startup.returncode:
            raise SystemExit(startup.stderr + (log.read_text() if log.exists() else startup.stdout))
        started = True
        psql = ['psql', '-X', '-h', directory, '-p', '55437', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
        bootstrap = """
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
$$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
"""
        subprocess.run(psql, input=bootstrap, text=True, check=True, capture_output=True)
        for filename in ('supabase/migrations/202608290001_megalab_community.sql', 'supabase/migrations/202610200001_topics.sql', 'supabase/tests/topics.sql', 'supabase/tests/topics-seed.sql'):
            result = subprocess.run(psql + ['-f', str(root / filename)], capture_output=True, text=True)
            if result.returncode:
                raise SystemExit(result.stdout + result.stderr)
        print('Topics database tests passed: moderation, member ownership, vote uniqueness/removal, privacy, meeting links, article-poll coexistence, and idempotent group topic seeds.')
    finally:
        if started:
            subprocess.run(['pg_ctl', '-D', str(cluster), '-m', 'immediate', '-w', 'stop'], check=True, capture_output=True)
