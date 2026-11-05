-- Anvar store row and its three Aktau locations. Data-only, idempotent, no DDL.
-- Needs 20261102000000_store_anvar_enum applied first (the enum value must be committed).
-- The site hides a store without offers in the current snapshot, so these rows show nothing until Anvar prices are published.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.stores (id, code, name, "logoUrl")
VALUES ('66abe18e-c352-4127-8426-af58b3b408b1','ANVAR','Анвар',NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.store_locations (id, "storeId", name, address, latitude, longitude)
SELECT v.id, '66abe18e-c352-4127-8426-af58b3b408b1', v.name, v.address, v.latitude, v.longitude
FROM (VALUES
 ('4676defe-2cb7-46d0-bc43-8f55bfe395f7','Гипермаркет «Анвар»','г. Актау, 12 микрорайон, 76',43.662815,51.146935),
 ('8952e80f-e2f0-4f11-9960-b2cc3faa4375','«Анвар» Акторе','г. Актау, мкр. Шыгыс-2, 250',43.684945,51.194566),
 ('ab47ae23-4b36-4b28-9ace-a803b67a0c99','«Анвар» 27 микрорайон','г. Актау, 27 микрорайон, 7а',43.662407,51.160477)
) AS v(id, name, address, latitude, longitude)
WHERE EXISTS (SELECT 1 FROM public.stores WHERE id = '66abe18e-c352-4127-8426-af58b3b408b1')
ON CONFLICT (id) DO NOTHING;

COMMIT;
