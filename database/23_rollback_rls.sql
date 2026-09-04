-- =====================================================================
-- MOZONA TPV — 23_rollback_rls.sql
-- =====================================================================
-- ROLLBACK DE EMERGENCIA — ejecuta esto si 22_rls_hardening_safe.sql
-- causa errores 403 inesperados en el restaurante.
--
-- ★ EFECTO: apaga RLS en 5 segundos y deja la BD como estaba
-- ★ SEGURO: no borra datos ni políticas (solo desactiva RLS)
-- ★ REVERSIBLE: puedes reactivar con 22_rls_hardening_safe.sql
--
-- QUÉ TOCA ESTE SCRIPT
--   - DISABLE ROW LEVEL SECURITY en 9 tablas de negocio
--   - DROP todas las políticas creadas por el 22
--   - NO toca auth.users, auth.sessions, ni storage.objects
--   - NO borra datos de las tablas
--   - Mantiene las funciones auxiliares (inertes hasta reactivar):
--     * public.get_user_tenant_id(UUID)
--     * public.is_superadmin_email(TEXT)
--     * public.current_user_is_superadmin()
--
-- CÓMO EJECUTAR
--   Opción A — desde Supabase SQL Editor:
--     1) New query
--     2) Pegar este archivo entero
--     3) Run
--
--   Opción B — desde psql:
--     psql> \i database/23_rollback_rls.sql
--
-- VERIFICACIÓN TRAS EJECUTAR
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
--   -- Todas las tablas deben tener rowsecurity = false
--   -- (excepto auth.users que NO se toca)
-- =====================================================================

-- ============================================================
-- 1. APAGAR RLS (instantáneo, sin pérdida de datos)
-- ============================================================
ALTER TABLE public.tenants         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_tables   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users    DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. ELIMINAR POLÍTICAS (limpieza, opcional pero recomendado)
-- ============================================================
-- Esto NO afecta a los datos, solo borra las reglas que el
-- 22_rls_hardening_safe.sql creó.

-- tenants
DROP POLICY IF EXISTS "tenants_select_own_or_admin"   ON public.tenants;
DROP POLICY IF EXISTS "tenants_update_own_or_admin"   ON public.tenants;
DROP POLICY IF EXISTS "tenants_insert_admin"          ON public.tenants;
DROP POLICY IF EXISTS "tenants_delete_admin"          ON public.tenants;

-- orders
DROP POLICY IF EXISTS "orders_select_own_or_admin"    ON public.orders;
DROP POLICY IF EXISTS "orders_insert_own_or_admin"    ON public.orders;
DROP POLICY IF EXISTS "orders_update_own_or_admin"    ON public.orders;
DROP POLICY IF EXISTS "orders_delete_admin_only"       ON public.orders;

-- order_items
DROP POLICY IF EXISTS "order_items_select_via_order"  ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_via_order"  ON public.order_items;
DROP POLICY IF EXISTS "order_items_update_via_order"  ON public.order_items;
DROP POLICY IF EXISTS "order_items_delete_via_order"  ON public.order_items;

-- products
DROP POLICY IF EXISTS "products_select_own_or_admin"   ON public.products;
DROP POLICY IF EXISTS "products_insert_own_or_admin"   ON public.products;
DROP POLICY IF EXISTS "products_update_own_or_admin"   ON public.products;
DROP POLICY IF EXISTS "products_delete_admin_only"     ON public.products;

-- categories
DROP POLICY IF EXISTS "categories_select_own_or_admin" ON public.categories;
DROP POLICY IF EXISTS "categories_insert_own_or_admin" ON public.categories;
DROP POLICY IF EXISTS "categories_update_own_or_admin" ON public.categories;
DROP POLICY IF EXISTS "categories_delete_admin_only"   ON public.categories;

-- dining_tables
DROP POLICY IF EXISTS "tables_select_own_or_admin"     ON public.dining_tables;
DROP POLICY IF EXISTS "tables_insert_own_or_admin"     ON public.dining_tables;
DROP POLICY IF EXISTS "tables_update_own_or_admin"     ON public.dining_tables;
DROP POLICY IF EXISTS "tables_delete_admin_only"       ON public.dining_tables;

-- tickets
DROP POLICY IF EXISTS "tickets_select_own_or_admin"    ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert_own_or_admin"    ON public.tickets;
DROP POLICY IF EXISTS "tickets_update_own_or_admin"    ON public.tickets;
DROP POLICY IF EXISTS "tickets_delete_admin_only"      ON public.tickets;

-- cash_closures
DROP POLICY IF EXISTS "cash_closures_select_own_or_admin" ON public.cash_closures;
DROP POLICY IF EXISTS "cash_closures_insert_own_or_admin" ON public.cash_closures;
DROP POLICY IF EXISTS "cash_closures_update_own_or_admin" ON public.cash_closures;
DROP POLICY IF EXISTS "cash_closures_delete_admin_only"   ON public.cash_closures;

-- tenant_users
DROP POLICY IF EXISTS "tenant_users_select_own_or_admin"  ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_insert_admin"         ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_update_admin"         ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_delete_admin"         ON public.tenant_users;

-- ============================================================
-- 3. RECARGAR PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 4. VERIFICACIÓN (debe ser todo 'f')
-- ============================================================
SELECT
    tablename,
    rowsecurity AS rls_activo,
    (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = t.tablename) AS num_politicas
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename IN (
      'tenants','orders','order_items','products','categories',
      'dining_tables','tickets','cash_closures','tenant_users'
  )
ORDER BY tablename;

-- Resultado esperado:
--   tablename       | rls_activo | num_politicas
--   ----------------+------------+---------------
--   cash_closures   | f          | 0
--   categories      | f          | 0
--   dining_tables   | f          | 0
--   order_items     | f          | 0
--   orders          | f          | 0
--   products        | f          | 0
--   tenants         | f          | 0
--   tenant_users    | f          | 0
--   tickets         | f          | 0

-- ============================================================
-- 5. KEEP — funciones auxiliares (no las borres)
-- ============================================================
-- Mantenemos:
--   public.get_user_tenant_id(UUID)
--   public.is_superadmin_email(TEXT)
--   public.current_user_is_superadmin()
-- Estas son inertes hasta que se reactive RLS.

-- =====================================================================
-- ROLLBACK COMPLETO. La BD vuelve a su estado anterior a
-- 22_rls_hardening_safe.sql. La aplicación debe seguir funcionando
-- como antes (con el esquema defensivo de queries try-catch).
-- =====================================================================
