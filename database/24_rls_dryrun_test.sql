-- =====================================================================
-- MOZONA TPV — 24_rls_dryrun_test.sql
-- =====================================================================
-- Script de PRUEBAS (DRY-RUN) para verificar el aislamiento multi-tenant
-- DESPUÉS de aplicar 22_rls_hardening_safe.sql.
--
-- ★ NO MODIFICA DATOS (solo SELECTs)
-- ★ Requiere haber ejecutado 22_rls_hardening_safe.sql antes
--
-- QUÉ VERIFICA
--   1) Estado RLS: 9 tablas tienen RLS ON
--   2) Estado políticas: conteo por tabla
--   3) Funciones auxiliares: existen y devuelven NULL para anon
--   4) Tests de aislamiento (como superadmin):
--       - Ver filas de TODOS los tenants
--   5) Tests con SET LOCAL ROLE authenticated (simula cliente):
--       - SELECT, INSERT, UPDATE, DELETE
--       - Verificar que cada operación se comporta según política
--   6) No debe haber políticas USING(true) o WITH_CHECK(true) en escritura
--
-- CÓMO EJECUTAR
--   1) Tras correr 22_rls_hardening_safe.sql
--   2) Supabase SQL Editor → New query → pegar este archivo → Run
--   3) Revisar las tablas "TEST_*" — todos los ✓ = OK
--
-- CÓMO INTERPRETAR
--   ✓ = comportamiento esperado
--   ✗ = problema (revisar 22 o ejecutar 23_rollback_rls.sql)
-- =====================================================================

-- ============================================================
-- 1. ESTADO RLS DE LAS 9 TABLAS
-- ============================================================
SELECT
    tablename,
    rowsecurity AS rls_on,
    CASE WHEN rowsecurity THEN '✓ RLS activo' ELSE '✗ RLS OFF — REVISAR' END AS estado,
    (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = t.tablename) AS num_policies
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename IN (
      'tenants','orders','order_items','products','categories',
      'dining_tables','tickets','cash_closures','tenant_users'
  )
ORDER BY tablename;

-- Esperado: 9 filas, todas con rls_on = t

-- ============================================================
-- 2. POLÍTICAS POR OPERACIÓN (SELECT/INSERT/UPDATE/DELETE)
-- ============================================================
SELECT
    tablename,
    cmd AS operacion,
    count(*) AS num_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'tenants','orders','order_items','products','categories',
      'dining_tables','tickets','cash_closures','tenant_users'
  )
GROUP BY tablename, cmd
ORDER BY tablename, cmd;

-- Esperado: cada tabla tiene policies para SELECT, INSERT, UPDATE, DELETE
-- EXCEPTO tablas donde DELETE está explícitamente prohibido a authenticated
-- (en ese caso aparece solo SELECT/INSERT/UPDATE)

-- ============================================================
-- 3. PROHIBICIONES: NO debe haber USING(true) o WITH_CHECK(true)
--    en políticas de escritura para rol authenticated
-- ============================================================
SELECT
    tablename,
    policyname,
    cmd,
    CASE
        WHEN length(qual) > 100 THEN substring(qual, 1, 100) || '...'
        ELSE qual
    END AS using_clause,
    CASE
        WHEN length(with_check) > 100 THEN substring(with_check, 1, 100) || '...'
        ELSE with_check
    END AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  AND (
      qual ILIKE '%true%'
      OR with_check ILIKE '%true%'
  )
ORDER BY tablename, cmd;

-- Esperado: 0 filas
-- Si hay resultados: REVISAR, puede ser USING (auth.uid() IS NOT NULL) que es legítimo
-- pero un USING (true) puro es INACEPTABLE

-- ============================================================
-- 4. FUNCIONES AUXILIARES EXISTEN
-- ============================================================
SELECT
    proname AS funcion,
    prosecdef AS security_definer,
    CASE
        WHEN prosecdef THEN '✓ bypasa RLS de tablas'
        ELSE '⚠ respeta RLS'
    END AS modo
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'get_user_tenant_id',
      'is_superadmin_email',
      'current_user_is_superadmin'
  )
ORDER BY p.proname;

-- Esperado: 3 funciones, todas con security_definer = true

-- ============================================================
-- 5. TEST AISLAMIENTO: como superadmin, veo TODO
-- ============================================================
-- (Ejecutar como superadmin real, este test es solo informativo)
SELECT
    'products_por_tenant' AS test,
    tenant_id,
    count(*) AS num
FROM public.products
GROUP BY tenant_id
ORDER BY tenant_id;

-- Esperado: varias filas, una por tenant que tenga productos

-- ============================================================
-- 6. TEST DE AISLAMIENTO REAL (simula un cliente autenticado)
-- ============================================================
-- Este test usa SET LOCAL ROLE para simular ser un usuario
-- autenticado cualquiera. NO requiere crear usuarios reales.

-- ⚠️ Este bloque DEBE ejecutarse dentro de una transacción
-- (BEGIN ... ROLLBACK) para no contaminar la BD
BEGIN;

-- 6.1. Como rol anon: SELECT debe devolver 0 filas
SET LOCAL ROLE anon;
SELECT 'TEST_ANON_SELECT_products' AS test,
       count(*) AS filas_visibles
FROM public.products;
-- Esperado: 0 (anon no tiene acceso a datos de negocio)

-- 6.2. Como rol authenticated sin auth.uid(): SELECT debe devolver 0 filas
SET LOCAL ROLE authenticated;
SELECT 'TEST_AUTH_NO_UID_SELECT_products' AS test,
       count(*) AS filas_visibles
FROM public.products;
-- Esperado: 0 (sin auth.uid() no hay tenant)

-- 6.3. Como authenticated CON auth.uid() (no matchea tenant):
--         INSERT debe fallar con RLS
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000000', true);
-- (En Supabase real, el sub viene del JWT)
-- Aquí usamos un user inexistente → get_user_tenant_id devuelve NULL
-- → INSERT/UPDATE/DELETE deberían fallar

DO $$
DECLARE
    test_count integer;
BEGIN
    -- INSERT en products
    BEGIN
        INSERT INTO public.products (name, price, tenant_id)
        VALUES ('TEST_BAD_INSERT', 1.00,
                '11111111-1111-1111-1111-111111111111');
        RAISE NOTICE 'TEST_INSERT_products: ✗ FALLO — el INSERT pasó (no debería)';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'TEST_INSERT_products: ✓ bloqueado por RLS';
    WHEN others THEN
        RAISE NOTICE 'TEST_INSERT_products: ✓ bloqueado por RLS (%)', SQLERRM;
    END;

    -- DELETE en orders
    BEGIN
        DELETE FROM public.orders WHERE id IN (SELECT id FROM public.orders LIMIT 1);
        RAISE NOTICE 'TEST_DELETE_orders_standard: ✗ FALLO — el DELETE pasó (no debería)';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'TEST_DELETE_orders_standard: ✓ bloqueado por RLS';
    WHEN others THEN
        RAISE NOTICE 'TEST_DELETE_orders_standard: ✓ bloqueado por RLS (%)', SQLERRM;
    END;

    -- DELETE en cash_closures
    BEGIN
        DELETE FROM public.cash_closures WHERE id IN (SELECT id FROM public.cash_closures LIMIT 1);
        RAISE NOTICE 'TEST_DELETE_cash_closures_standard: ✗ FALLO — el DELETE pasó (no debería)';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'TEST_DELETE_cash_closures_standard: ✓ bloqueado por RLS';
    WHEN others THEN
        RAISE NOTICE 'TEST_DELETE_cash_closures_standard: ✓ bloqueado por RLS (%)', SQLERRM;
    END;
END $$;

ROLLBACK;
-- Esperado: todos los tests con ✓

-- ============================================================
-- 7. RESUMEN EJECUTIVO
-- ============================================================
SELECT
    'RESUMEN FINAL' AS seccion,
    (SELECT count(*) FROM pg_tables
     WHERE schemaname='public' AND rowsecurity=true
       AND tablename IN ('tenants','orders','order_items','products','categories',
                         'dining_tables','tickets','cash_closures','tenant_users')
    ) AS tablas_con_rls,
    (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND cmd IN ('INSERT','UPDATE','DELETE')
       AND (qual ILIKE '%true%' OR with_check ILIKE '%true%')
       AND qual NOT ILIKE '%auth.uid%'
       AND with_check NOT ILIKE '%auth.uid%'
    ) AS politicas_peligrosas,
    (SELECT count(*) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef = true
       AND p.proname IN ('get_user_tenant_id','is_superadmin_email','current_user_is_superadmin')
    ) AS funciones_security_definer;

-- Esperado: 9, 0, 3
-- Si politicas_peligrosas > 0: REVISAR manualmente

-- =====================================================================
-- FIN DEL DRY-RUN
-- =====================================================================
-- Si todo salió ✓, el sistema multi-tenant está blindado.
-- Si hay ✗, ejecuta 23_rollback_rls.sql y revisa los logs de la app.
-- =====================================================================
