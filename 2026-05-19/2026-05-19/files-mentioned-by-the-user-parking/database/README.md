# VAY ParkOps SQLite Database

Database file:

`database/vay_parkops.db`

Supporting files:

- `schema.sql`: table structure for production parking data
- `seed.sql`: demo users, tariffs, devices, active parking sessions, payments, staff pass, and audit logs

Main tables:

- `users`
- `tariffs`
- `devices`
- `staff_passes`
- `parking_sessions`
- `payments`
- `audit_logs`
- `uhf_command_logs`

The current browser app is still static and uses in-memory demo data. This database is ready for the next step: adding a small backend API so the app can save entries, exits, payments, reports, and staff free parking permanently.

## Run the Database-Backed App

Double-click:

`start-vay-parkops.bat`

Then open:

`http://localhost:4175`

When the app is opened through this local server, entries, exits, payments, staff free parking, and UHF command logs are saved into `vay_parkops.db`.
