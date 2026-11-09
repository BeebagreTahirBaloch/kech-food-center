# Private database and menu-image backups

Back up weekly and before major changes or order deletion. Keep a private off-device copy. Take the first backup during a quiet maintenance window, pause new ordering through admin, and avoid menu edits while collecting the database and image snapshots. Record counts are measured after the database dump; simultaneous inserts/deletes can make a restore-count comparison differ, so repeat in a quiet window if needed. Resume ordering afterward.

Database dumps alone do not contain Storage image files. This process follows the [Supabase CLI backup/restore approach](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) and separately downloads `menu-images` with checksums. Preserve the source code and migrations as well. This guide never runs or modifies the project's `supabase/schema.sql`; `database-schema.sql` below is a private generated backup file.

## Create a backup

Requirements: Node, Supabase CLI available to `npx --no-install supabase`, Docker Desktop running, and the CLI logged in/linked to the correct project. The script verifies that the linked reference matches the backup URL. The standard Node/npm installation is used to launch the CLI without a shell or credentials in command arguments.

Create a private, ignored `.env.backup` file locally:

```dotenv
BACKUP_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
BACKUP_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_KEY
# Optional: choose a private folder outside the served website directory.
BACKUP_DIRECTORY=E:/private-kfc-backups
```

Never commit this file, put these values in VITE variables, or share screenshots of its contents. The backup itself contains customer data and authentication records: keep it private and encrypted when copied off-device.

Run from the project folder:

```powershell
node --env-file=.env.backup scripts/backup-project.mjs
```

The timestamped private folder contains role/schema/data SQL dumps, a `menu-images` tree, checksums/counts in `manifest.json`, and a `COMPLETE` marker only after successful downloads. Incomplete folders are not valid backups. The default destination is a sibling private-backups directory, outside the website directory. Protect it with your Windows account permissions and keep a separate private copy. There is no automatic scheduling or retention deletion; use your normal private backup scheduler after the first successful drill.

## Test restoration locally

Requirements: Docker, a **new empty local Supabase test stack**, and PostgreSQL `psql` on PATH. Create/start the empty test stack from a separate test directory, following the Supabase local-development instructions. Do not start it from this application directory where migrations would populate the target. Keep all messaging disabled in the test stack; do not configure its external push worker/Cron or Telegram.

Create a separate ignored `.env.restore` file with that local stack's values:

```dotenv
CONFIRM_LOCAL_RESTORE=RESTORE_EMPTY_LOCAL_TEST
RESTORE_DATABASE_URL=postgresql://postgres:LOCAL_TEST_PASSWORD@127.0.0.1:54322/postgres
RESTORE_SUPABASE_URL=http://127.0.0.1:54321
RESTORE_SERVICE_ROLE_KEY=LOCAL_TEST_SERVICE_KEY
```

Then run, supplying the actual backup folder:

```powershell
node --env-file=.env.restore scripts/restore-backup-local.mjs E:/private-kfc-backups/TIMESTAMP
```

The restore tool refuses remote hosts and a target already containing `public.orders`. It verifies dump checksums, restores SQL in one transaction, uploads menu images, compares critical table counts and checks every restored image checksum. A successful check writes `restore-verification.json`. If restoration fails, keep the logs/private inputs local, resolve the cause, and use a fresh test stack for the next attempt. Do not bypass the local-host checks to restore production.

Afterward point a separate local frontend at the local anon key/URL. Check menu counts, admin/rider login, a historical order, monthly history, RLS access refusal and an image downloaded directly from the restored local bucket. Existing `image_url` values still refer to the original host: remap their host in the isolated restore when testing a complete application migration. Re-enable Realtime publications as needed in the test stack.

Vault encryption keys, Edge secrets, deployment/hosting settings, SMTP, custom domains and scheduler setup require a separate private recovery checklist. For an actual disaster migration, follow the official guide's Vault/encryption instructions; they are not restored by copying menu images. Do not enable restored subscriptions, Cron or Telegram against real devices during a drill.

The CLI also excludes custom changes inside managed `auth` and `storage` schemas from its default schema dump. Restore the menu-image Storage policies and any custom Auth triggers separately in the isolated test stack, following the official guide's “Schema changes to auth and storage” section. Verify that anonymous image reads work and only admins can upload or delete. Preserve CLI migration history separately if you use it to manage deployments. Passing the count/hash checks alone does not prove these access controls have been restored.

## Local verification in this workspace

```powershell
node scripts/test-backup-tools.mjs
node scripts/test-customer-operations.mjs
```

Fixtures test nested image download, path traversal rejection, checksum/corruption detection, count mismatch, local-only restore guards, archive totals and database permissions. A full external database restore has **not** been run here: Docker, psql and production backup credentials are unavailable. Keep that distinction until you have a successful local restore verification and application smoke test.
