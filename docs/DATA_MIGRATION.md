# Moving data from the old Supabase project (optional)

The new portal runs entirely on the Plesk database. This guide is only needed
if you want to bring over the records from the old Supabase project. If that
project is gone or you can't sign in to it, skip to
[Starting fresh](#starting-fresh-no-old-data).

Nothing here modifies the old Supabase project. Exporting only reads from it.
The production app never connects to Supabase, and the import tool doesn't
either: it reads exported files.

## What carries over

| Supabase table | New table | Notes |
|---|---|---|
| `profiles` | `users` | Same UUIDs, names, emails and roles. **Passwords don't carry over**: Supabase Auth hashes aren't imported, and imported users can't sign in until an admin sets a password. |
| `horses`, `feeding_charts`, `feeding_logs` | same names | One chart per horse and one log per horse/AM-PM/day are enforced. Duplicates are reported, and the first row is kept. |
| `tasks`, `shifts`, `availability`, `time_off_requests` | same names | |
| `announcements`, `clock_logs`, `admin_notes` | same names | |

IDs are preserved, so every relationship (task → assignee, chart → horse,
etc.) survives. Timestamps are converted to UTC.

## 1. Export from Supabase

You need access to the Supabase dashboard of the old project. Export **each**
table above to a file named exactly after the table, for example
`profiles.csv` or `tasks.csv`, and put all the files in one folder.

**Option A, table editor (easiest):** *Table Editor* → pick the table →
**Export → Export table as CSV**. Repeat for every table and rename each file
to `<table>.csv`.

**Option B, SQL editor:** run `select * from public.tasks;`, then use
**Download CSV**, and repeat for each table. You can also produce JSON with
`select json_agg(t) from public.tasks t;` and save the result as `tasks.json`
(an array of row objects).

**Option C, psql**, if you still have the database connection string:

```bash
for t in profiles horses feeding_charts feeding_logs tasks shifts availability \
         time_off_requests announcements clock_logs admin_notes; do
  psql "$OLD_SUPABASE_DB_URL" -c "\copy public.$t to '$t.csv' csv header"
done
```

Missing files are fine; those tables are skipped. These files contain staff
names, emails and schedules, so keep them private and never commit them. The
repository ignores a top-level `supabase-export/` folder for this reason.

## 2. Prepare the Plesk database

Follow `docs/PLESK_DEPLOYMENT.md` through step 6: database created,
migrations applied, first admin created. Creating your admin first with the
**same email** you used in Supabase is fine: the importer merges that profile
into your new account and rewrites its old ID everywhere.

## 3. Copy the files to the server and do a dry run

```bash
# from your computer
scp -r supabase-export/ <ssh-user>@<server>:/var/www/vhosts/portal.example.com/supabase-export/

# on the server
cd /var/www/vhosts/portal.example.com/httpdocs
export PATH=/opt/plesk/node/22/bin:$PATH
npm run import:supabase -- --dir ../supabase-export --dry-run
```

Keep the export folder **outside** `httpdocs/public` (the example above puts it
next to `httpdocs`, which is not web-accessible).

The dry run does the whole import inside a transaction and then rolls it
back. It prints one line per table:

```
  profiles           read 4, imported 3, already present 0, merged by email 1, skipped 0
  tasks              read 57, imported 56, already present 0, skipped 1, warnings 2
  ...
Dry run complete; all changes rolled back.
Report written to ../supabase-export/import-report-<time>.json
```

Open the report. For every row that wasn't imported it lists the ID and the
reason, for example:

- `profile has no email address`: recreate that person in **Employees → Add user**.
- `duplicate of an existing feeding_charts row`: the old database had two charts
  for one horse; the first was kept.
- `employee_id … does not exist in users`: the row pointed at a deleted person.
- warnings such as `assigned_to … not found; set to NULL`: the row was imported
  without that optional link.

## 4. Import for real

```bash
npm run import:supabase -- --dir ../supabase-export
```

Same output, ending in `Import committed.` It's safe to run again: rows whose
ID already exists are counted as "already present" and left untouched.
Nothing existing is ever updated or deleted.

## 5. Give imported users passwords

Imported accounts show **"no password set — can't sign in yet"** in
**Admin → Employees**. For each person, open **Set password**, enter a
temporary password, and share it with them privately. They can change it under
**More → Change password**. Over SSH you can instead run
`npm run set-password -- --email person@example.com`.

## 6. Clean up

Delete the export files and reports from the server and your computer once
you've checked the data:

```bash
rm -rf /var/www/vhosts/portal.example.com/supabase-export
```

---

## Starting fresh (no old data)

If the Supabase project isn't available:

1. Deploy and migrate as in `docs/PLESK_DEPLOYMENT.md` (the database starts
   empty; nothing else is required).
2. `npm run create-admin -- --email <your email> --name "<your name>"` over SSH.
3. Sign in, then add each staff member in **Admin → Employees → Add user**,
   choosing *Employee* or *Admin* and a temporary password. Previously the
   farm had two admins and two employees; recreate them with their own emails.
4. Re-enter horses and feeding charts under **Admin → Feeding Charts**
   (including the barn assignment, so the barn TVs show the right horses),
   then schedules, tasks and announcements as needed.
5. Optionally, on a test install only, `npm run db:seed-demo -- --yes` adds two
   sample horses and an announcement so you can check the barn displays. It does
   nothing if any horse already exists.
