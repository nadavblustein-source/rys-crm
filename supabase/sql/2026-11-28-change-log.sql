-- Applied to prod 2026-11-28 (via execute_sql). Change log: archived items + groups/columns structure.
-- rys_items_log(): also logs archived true/false (see live definition).
-- public.rys_struct_log(): logs insert/delete/title/hidden/labels changes on rys_groups and rys_columns into rys_activity (item_id null).
create trigger rys_groups_log after insert or update or delete on public.rys_groups for each row execute function public.rys_struct_log();
create trigger rys_columns_log after insert or update or delete on public.rys_columns for each row execute function public.rys_struct_log();
-- rys_submit_form(p): also saves long_textycnewz3l (customer notes, max 2000 chars).
