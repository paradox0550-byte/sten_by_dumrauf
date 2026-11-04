# STEN database migrations

## Shared FOT persistence — 2026-11-04

File: `20261104_fot_shared_persistence.sql`

This migration creates three organization-scoped stores:

- `fot_schedule_history` — monthly schedule calculations and their source metadata.
- `fot_staffing_plans` — staffing scenario by organization, workspace scope and month.
- `fot_custom_position_sets` — custom department positions shared within the same workspace scope.

It does **not** modify `payroll_records`, P&L, existing employee pay facts, or any existing table. The backend startup bootstrap deliberately does not execute this migration.

### Apply

1. Confirm the target PostgreSQL cluster and database in the Yandex Cloud Console. Do not use the stopped legacy cluster.
2. Take and verify a current database backup / recovery point.
3. Review the SQL file and run it once from a trusted machine with network access to the private database, using an authorized database account. Keep the connection string and password out of shell history and logs.
4. Apply with `psql` and stop on the first error:

   ```sh
   psql "$STEN_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/migrations/20261104_fot_shared_persistence.sql
   ```

5. Verify the three tables and indexes exist before deploying a backend that contains the new routes.
6. After backend publication, verify authenticated read/write/readback for two restaurants in the same organization and verify that a user without access to the second restaurant receives 403.

The migration is idempotent: it uses `CREATE TABLE/INDEX IF NOT EXISTS` and does not delete or rewrite existing business data.

### Rollback

Do not drop these tables as a routine application rollback. Reverting the application to the previous release leaves the new data safely unused. If the feature must be disabled, roll back the application first and retain the tables until a separately reviewed data-retention decision.

### Legacy browser data

On first successful load, the frontend attempts to copy legacy FOT history periods that do not yet exist in PostgreSQL. Staffing plans and custom positions are imported only when the corresponding server-side data is empty. Existing shared records are never overwritten by a browser-local copy. The old browser keys are retained as a recovery source; they are not the active save target.
