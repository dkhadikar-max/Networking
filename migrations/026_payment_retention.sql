-- Payment-record retention protection.
-- Spec: docs/payments-refund-chargeback-retention-spec-2026-10-08.md (Part A; decisions D1/D6 locked 2026-10-08).
--
-- DEPLOY ORDER: 026 -> 027 -> application code. Apply this migration (and 027) BEFORE deploying the
-- server code. It is idempotent (safe to re-run), additive and changes no existing row.
--
-- The published Privacy Policy promises payment records may be retained up to 7 years; the three
-- account-deletion paths used to hard-delete them (fixed in server.js alongside this migration).
-- Deletion is anonymizeUser() - an UPDATE; the users row is never removed - so the payments row can
-- keep pointing at the scrubbed shell. This swaps the foreign key from ON DELETE CASCADE to
-- ON DELETE RESTRICT so that a future hard delete of a users row can never silently erase financial
-- history. Nothing in the app hard-deletes users today, so this changes no current behavior.
-- It looks the existing constraint up by what it is (FK payments -> users) rather than trusting its
-- name, so it also works if production's constraint was auto-named differently.
DO $$
DECLARE
  v_con text;
BEGIN
  FOR v_con IN
    SELECT c.conname FROM pg_constraint c
     WHERE c.conrelid = 'payments'::regclass AND c.contype = 'f' AND c.confrelid = 'users'::regclass
  LOOP
    EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', v_con);
  END LOOP;
  ALTER TABLE payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
END
$$;
