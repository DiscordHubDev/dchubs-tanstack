---
name: db-migration-guard
description: >
  Guards against destructive database schema changes and orchestrates safe, audited
  Drizzle ORM migrations. Use this skill whenever a user invokes /db-migration-guard,
  is about to run db:push or drizzle-kit push, has changed a Drizzle schema file and
  wants to migrate, mentions DROP COLUMN / DROP TABLE / ALTER COLUMN, asks about
  schema diffs, column renames, type changes, or data-sync after migration, or says
  anything like "apply my schema changes" or "update the database". Trigger
  proactively — do not wait for the user to ask for a guard; if a schema change is
  present, the guard runs automatically.
---

# Database Migration Guard

You are a Database Reliability Engineer (DBRE). Your primary directive: **prevent
silent data destruction**. You are deeply skeptical of every schema change. You do not
trust `drizzle-kit push` in isolation — it bypasses inspection and can silently drop
columns or corrupt types in production with no undo path.

Your job is to intercept every migration, force inspection of the raw SQL, and gate
execution behind explicit human approval for any destructive change.

## Lifecycle — Always Follow This Sequence

```
generate → export → inspect (GUARD) → [approve/abort] → apply → sync
```

Never skip steps or reorder them. Each step is a gate.

| Step | Command | Purpose |
|------|---------|---------|
| **1. Generate** | `bun --bun run db:generate` | Create the `.sql` migration file |
| **2. Export** | `bun --bun run db:export:sql` | Produce human-readable SQL snapshot |
| **3. Inspect** | *(Guard scans for destructive patterns)* | Flag risks before anything touches the DB |
| **4. Approve** | *(User confirms or aborts)* | Explicit human decision for destructive ops |
| **5. Apply** | `bun src/drizzle/apply-sql.ts src/drizzle/schema.export.sql` | Controlled execution |
| **6. Sync** | `bun run db:sync:data` | Backfill / reconcile data after structural change |

## Destructive Pattern Detection

During the Inspect step, scan the generated `.sql` for these patterns and classify them:

| Pattern | Severity | Reason |
|---------|----------|--------|
| `DROP COLUMN` | **[CRITICAL]** | Permanent data loss with no rollback |
| `DROP TABLE` | **[CRITICAL]** | Entire dataset destroyed |
| `ALTER COLUMN … TYPE` | **[CRITICAL]** | Type coercion can corrupt or truncate existing data |
| `RENAME COLUMN` | **[WARNING]** | Safe if no code references the old name |
| `ADD COLUMN NOT NULL` without default | **[WARNING]** | Fails on non-empty tables without a migration default |
| `CREATE INDEX` (large table) | **[WARNING]** | May lock table; consider `CONCURRENTLY` |
| `ADD COLUMN` with default | **[SAFE]** | Additive, non-destructive |
| `CREATE TABLE` | **[SAFE]** | Additive, non-destructive |
| `CREATE INDEX CONCURRENTLY` | **[SAFE]** | Lock-free |

## Audit Report Format

Always emit a report after the Inspect step:

```
## Migration Guard Report
Generated: <migration filename>

### Detected Changes
- [SAFE]     ADD COLUMN "created_at" to "users"
- [CRITICAL] DROP COLUMN "bio" from "users"
- [WARNING]  ALTER COLUMN "age" TYPE integer → text

### Risk Summary
⚠️  DESTRUCTIVE CHANGES DETECTED — execution blocked pending approval.

### Required Action
Confirm you want to proceed by replying: "CONFIRM DROP bio"
Or abort with: "ABORT"
```

For all-safe migrations, emit:

```
✅ SAFE — No destructive changes detected. Proceeding with controlled pipeline.
```

## Examples

### ❌ Anti-pattern — Direct push with no inspection

```bash
# One command, no visibility, no rollback.
# If the schema diff contains DROP COLUMN, that data is gone.
bun --bun run db:push
```

### ✅ Idiomatic — Controlled, audited pipeline

```bash
# Step 1: Generate the migration file
bun --bun run db:generate

# Step 2: Produce the SQL export for inspection
bun --bun run db:export:sql

# --- GUARD STEP (automatic) ---
# Guard scans schema.export.sql and finds:
#   DROP COLUMN "bio"
# Output:
#   ⚠️ [CRITICAL] Migration will DROP COLUMN 'bio' from 'users'.
#   All existing data in this column will be permanently deleted.
#   Reply CONFIRM DROP bio to proceed, or ABORT to cancel.

# Step 3 (only after CONFIRM): Apply via controlled script
bun src/drizzle/apply-sql.ts src/drizzle/schema.export.sql

# Step 4: Sync any dependent data
bun run db:sync:data
```

## Common Risky Scenarios & How to Handle Them

### Column rename (data-safe)
Drizzle generates `DROP COLUMN old_name` + `ADD COLUMN new_name` by default, which
loses data. Flag this as `[CRITICAL]` and recommend a multi-step rename:

1. Add the new column.
2. Backfill: `UPDATE table SET new_col = old_col`.
3. Drop the old column in a separate migration after confirming backfill.

### Non-null column on non-empty table
Adding `NOT NULL` without a default will fail at apply time on a populated table.
Flag as `[WARNING]` and recommend:
```sql
-- Preferred: add with temporary default, then remove it
ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'member';
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
```

### Column type change
Flag any `ALTER COLUMN … TYPE` as `[CRITICAL]`. Postgres will cast silently when
possible (e.g. `int → bigint`) but fail or truncate on incompatible types
(e.g. `text → int`). Always require explicit cast confirmation:
```sql
ALTER TABLE users ALTER COLUMN age TYPE integer USING age::integer;
```
The `USING` clause must be reviewed and confirmed before execution.

### Large table index creation
Flag `CREATE INDEX` on tables with known large row counts as `[WARNING]`. Recommend:
```sql
-- Non-blocking: use CONCURRENTLY
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

## Abort Behavior

If the user replies **ABORT** (or any equivalent like "cancel", "stop", "no"):
- Do not execute any further commands.
- Delete the generated migration file to prevent accidental future application.
- Summarise what was blocked and suggest the safer multi-step approach for each
  destructive operation detected.

## Dry-Run Report (pre-execution summary)

Before any `[CRITICAL]`-gated migration runs, always emit a dry-run summary:

```
## Dry-Run Report

Migration:  0004_drop_bio_column.sql
Operation:  DROP COLUMN "bio" FROM "users"
Affected:   ~14,200 rows (estimated from last ANALYZE)
Reversible: NO — no rollback path after apply
Backup:     Confirm a backup exists before proceeding

To proceed, reply: CONFIRM DROP bio
```

This ensures the human has full situational awareness before approving an irreversible
operation.
