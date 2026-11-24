# CIMFEST backend

Run these PowerShell commands from the repository root with Docker Desktop running.

If the project-local CLI is missing, install [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and use `supabase` in place of the executable path.

```powershell
& ./.tools/bin/supabase.exe start
& ./.tools/bin/supabase.exe migration up
& ./.tools/bin/supabase.exe status -o env
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

On a fresh checkout, fill in `.env` using the local CLI status output. Map `API_URL` to `SUPABASE_URL` and `DB_URL` to `DATABASE_URL`. Use `PUBLISHABLE_KEY` and `SECRET_KEY` for the corresponding Supabase keys.

Install the Python dependencies and start FastAPI.

```powershell
py -m venv .venv
& ./.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
& ./.venv/Scripts/python.exe -m uvicorn backend.main:app --reload
```

The [database design](../documentation/ERD.md) describes the tables and relationships created by the migration.

- API docs at http://127.0.0.1:8000/docs
- API health at http://127.0.0.1:8000/health
- PostgreSQL health at http://127.0.0.1:8000/health/db
- Supabase Studio at http://127.0.0.1:54323
