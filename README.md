# RYS CRM

A small Monday-style board for the "Restart your soul" customers, built on Supabase.

- `index.html`, `app.js`, `app.css`: the board (table, kanban, item panel with updates, details, payments and history).
- `admin.js`: the admin screen (users and passwords, groups, columns and status labels, automations, recycle bin).
- `config.js`: the Supabase project URL and its public (publishable) key. Data is protected by row-level security: only users listed in `rys_members` can read or change anything.
