-- STAGE ONLY: sequence definitions and ownership recovered from production catalog 2026-10-14.
-- Create sequences before table defaults that call nextval(); apply ownership after tables exist.

CREATE SEQUENCE public.audit_deleted_rows_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public.group_audit_log_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

-- No owned sequences detected.