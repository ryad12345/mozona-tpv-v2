-- =====================================================================
-- MOZONA TPV — 22_rls_hardening_safe.sql
-- =====================================================================
-- Endurecimiento de RLS para aislamiento multi-tenant estricto.
--
-- ★ EJECUTAR SOLO EN VENTANA DE MANTENIMIENTO NOCTURNA
--   (local cerrado, sin producción en curso)
--
-- ★ NO EJECUTAR SI EL RESTAURANTE ESTÁ OPERANDO
--   (los clientes actuales ya cargaron datos en memoria;
--    cambiar políticas a mitad de servicio puede tirar la app)
--
-- ★ ROLLBACK INMEDIATO: 23_rollback_rls.sql
--   (apaga RLS en 5 segundos sin pérdida de datos)
--
-- POLÍTICA GENERAL
--   - Usuarios autenticados: leen/escriben SOLO filas cuyo
--     tenant_id coincida con el de su tenant_users
--   - rofixinsta@gmail.com: bypass TOTAL (admin)
--   - service_role: bypass TOTAL (server-side)
--   - anon: DENEGADO (no debería tocar datos de negocio)
--
-- TABLAS CUBIERTAS
--   - tenants                  (lectura propia + admin)
--   - orders                   (CRUD por tenant)
--   - order_items              (CRUD por tenant via orders)
--   - products                 (CRUD por tenant)
--   - categories               (CRUD por tenant)
--   - dining_tables            (CRUD por tenant)
--   - tickets                  (CRUD por tenant)
--   - cash_closures            (CRUD por tenant)
--   - tenant_users             (lectura propia + admin)
-- =====================================================================

-- ============================================================
-- 0. KILL SWITCH — apaga RLS si algo va mal
-- ============================================================
-- Para ejecutar el rollback rápido:
--   psql> \i database/23_rollback_rls.sql
--
-- O manualmente:
--   ALTER TABLE public.orders          DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.order_items     DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.products        DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.categories      DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.dining_tables   DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.tickets         DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.cash_closures   DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.tenants         DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.tenant_users    DISABLE ROW LEVEL SECURITY;
-- ============================================================

-- ============================================================
-- 1. FUNCIÓN AUXILIAR: get_user_tenant_id
-- ============================================================
-- SECURITY DEFINER: bypasa RLS de tenant_users para resolver el tenant
-- STABLE: el optimizador la cachea por query
-- ROWS 1: rápida, single-row
DROP FUNCTION IF EXISTS public.get_user_tenant_id(UUID);
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN NULL;
    END IF;
    -- Busca en tenant_users (tabla de mapeo usuario → tenant)
    -- Intenta por user_id (UUID) o por email si user_id no encaja
    SELECT tenant_id INTO v_tenant_id
    FROM public.tenant_users
    WHERE user_id = p_user_id
    LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
        RETURN v_tenant_id;
    END IF;
    -- Fallback: si no hay tenant_users, intentar por owner_id en tenants
    SELECT id INTO v_tenant_id
    FROM public.tenants
    WHERE owner_id = p_user_id
    LIMIT 1;
    RETURN v_tenant_id;
EXCEPTION WHEN OTHERS THEN
    -- Si tenant_users o tenants no existen, devuelve NULL (sin acceso)
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tenant_id(UUID) TO authenticated, anon, service_role;

-- ============================================================
-- 2. FUNCIÓN: is_superadmin_email
-- ============================================================
-- Devuelve TRUE si el email es del superadmin (configurable)
DROP FUNCTION IF EXISTS public.is_superadmin_email(TEXT);
CREATE OR REPLACE FUNCTION public.is_superadmin_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT lower(p_email) IN ('rofixinsta@gmail.com');
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin_email(TEXT) TO authenticated, anon, service_role;

-- ============================================================
-- 3. FUNCIÓN: current_user_is_superadmin
-- ============================================================
-- Combina: JWT email + is_superadmin_email
DROP FUNCTION IF EXISTS public.current_user_is_superadmin();
CREATE OR REPLACE FUNCTION public.current_user_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM auth.users
        WHERE id = auth.uid()
          AND email IN (SELECT lower(s) FROM unnest(string_to_array(
              (SELECT current_setting('app.superadmin_emails', true)),
              ',')) AS s WHERE s <> '')
    ) OR (
        SELECT email FROM auth.users WHERE id = auth.uid()
    ) = 'rofixinsta@gmail.com';
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_superadmin() TO authenticated, anon, service_role;

-- ============================================================
-- 4. ÍNDICES (para que las políticas no maten el rendimiento)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id        ON public.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id       ON public.tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_owner_id             ON public.tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_id            ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id         ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_id        ON public.order_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id           ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id         ON public.categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dining_tables_tenant_id      ON public.dining_tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id            ON public.tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_closures_tenant_id      ON public.cash_closures(tenant_id);

-- ============================================================
-- 5. HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================
ALTER TABLE public.tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_tables   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. LIMPIEZA DE POLÍTICAS PREVIAS (idempotencia)
-- ============================================================
-- tenants
DROP POLICY IF EXISTS "tenants_select_own_or_admin"   ON public.tenants;
DROP POLICY IF EXISTS "tenants_update_own_or_admin"   ON public.tenants;
DROP POLICY IF EXISTS "tenants_insert_admin"          ON public.tenants;
DROP POLICY IF EXISTS "tenants_delete_admin"          ON public.tenants;
DROP POLICY IF EXISTS "tenants_select_public"         ON public.tenants;

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
-- 7. POLÍTICAS — tenants
-- ============================================================
-- Lectura: usuario autenticado ve su tenant + superadmin ve todos
CREATE POLICY "tenants_select_own_or_admin"
    ON public.tenants
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR id = public.get_user_tenant_id(auth.uid())
        OR owner_id = auth.uid()
    );

-- Update: solo el owner de su tenant, o superadmin
CREATE POLICY "tenants_update_own_or_admin"
    ON public.tenants
    FOR UPDATE
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR owner_id = auth.uid()
    )
    WITH CHECK (
        public.current_user_is_superadmin()
        OR owner_id = auth.uid()
    );

-- Insert/Delete: solo superadmin (o service_role)
-- (Los tenants se crean vía admin o signup especial)
CREATE POLICY "tenants_insert_admin"
    ON public.tenants
    FOR INSERT
    TO authenticated
    WITH CHECK (public.current_user_is_superadmin());

CREATE POLICY "tenants_delete_admin"
    ON public.tenants
    FOR DELETE
    TO authenticated
    USING (public.current_user_is_superadmin());

-- ============================================================
-- 8. POLÍTICAS — orders
-- ============================================================
CREATE POLICY "orders_select_own_or_admin"
    ON public.orders
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "orders_insert_own_or_admin"
    ON public.orders
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "orders_update_own_or_admin"
    ON public.orders
    FOR UPDATE
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    )
    WITH CHECK (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

-- DELETE: SOLO superadmin (un usuario estándar NO debe borrar ventas)
CREATE POLICY "orders_delete_admin_only"
    ON public.orders
    FOR DELETE
    TO authenticated
    USING (public.current_user_is_superadmin());

-- ============================================================
-- 9. POLÍTICAS — order_items
-- ============================================================
-- order_items hereda el tenant via orders.tenant_id
CREATE POLICY "order_items_select_via_order"
    ON public.order_items
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.tenant_id = public.get_user_tenant_id(auth.uid())
        )
        -- O si la propia tabla tiene tenant_id (defensivo)
        OR (tenant_id IS NOT NULL
            AND tenant_id = public.get_user_tenant_id(auth.uid()))
    );

CREATE POLICY "order_items_insert_via_order"
    ON public.order_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_user_is_superadmin()
        OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.tenant_id = public.get_user_tenant_id(auth.uid())
        )
        OR (tenant_id IS NOT NULL
            AND tenant_id = public.get_user_tenant_id(auth.uid()))
    );

CREATE POLICY "order_items_update_via_order"
    ON public.order_items
    FOR UPDATE
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.tenant_id = public.get_user_tenant_id(auth.uid())
        )
    );

CREATE POLICY "order_items_delete_via_order"
    ON public.order_items
    FOR DELETE
    TO authenticated
    USING (public.current_user_is_superadmin());

-- ============================================================
-- 10. POLÍTICAS — products
-- ============================================================
CREATE POLICY "products_select_own_or_admin"
    ON public.products
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "products_insert_own_or_admin"
    ON public.products
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "products_update_own_or_admin"
    ON public.products
    FOR UPDATE
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    )
    WITH CHECK (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "products_delete_admin_only"
    ON public.products
    FOR DELETE
    TO authenticated
    USING (public.current_user_is_superadmin());

-- ============================================================
-- 11. POLÍTICAS — categories
-- ============================================================
CREATE POLICY "categories_select_own_or_admin"
    ON public.categories
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "categories_insert_own_or_admin"
    ON public.categories
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "categories_update_own_or_admin"
    ON public.categories
    FOR UPDATE
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "categories_delete_admin_only"
    ON public.categories
    FOR DELETE
    TO authenticated
    USING (public.current_user_is_superadmin());

-- ============================================================
-- 12. POLÍTICAS — dining_tables
-- ============================================================
CREATE POLICY "tables_select_own_or_admin"
    ON public.dining_tables
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "tables_insert_own_or_admin"
    ON public.dining_tables
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "tables_update_own_or_admin"
    ON public.dining_tables
    FOR UPDATE
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "tables_delete_admin_only"
    ON public.dining_tables
    FOR DELETE
    TO authenticated
    USING (public.current_user_is_superadmin());

-- ============================================================
-- 13. POLÍTICAS — tickets
-- ============================================================
CREATE POLICY "tickets_select_own_or_admin"
    ON public.tickets
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "tickets_insert_own_or_admin"
    ON public.tickets
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "tickets_update_own_or_admin"
    ON public.tickets
    FOR UPDATE
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "tickets_delete_admin_only"
    ON public.tickets
    FOR DELETE
    TO authenticated
    USING (public.current_user_is_superadmin());

-- ============================================================
-- 14. POLÍTICAS — cash_closures
-- ============================================================
CREATE POLICY "cash_closures_select_own_or_admin"
    ON public.cash_closures
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "cash_closures_insert_own_or_admin"
    ON public.cash_closures
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "cash_closures_update_own_or_admin"
    ON public.cash_closures
    FOR UPDATE
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "cash_closures_delete_admin_only"
    ON public.cash_closures
    FOR DELETE
    TO authenticated
    USING (public.current_user_is_superadmin());

-- ============================================================
-- 15. POLÍTICAS — tenant_users
-- ============================================================
-- Usuario ve SU fila; superadmin ve todas
CREATE POLICY "tenant_users_select_own_or_admin"
    ON public.tenant_users
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_is_superadmin()
        OR user_id = auth.uid()
        OR tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "tenant_users_insert_admin"
    ON public.tenant_users
    FOR INSERT
    TO authenticated
    WITH CHECK (public.current_user_is_superadmin());

CREATE POLICY "tenant_users_update_admin"
    ON public.tenant_users
    FOR UPDATE
    TO authenticated
    USING (public.current_user_is_superadmin());

CREATE POLICY "tenant_users_delete_admin"
    ON public.tenant_users
    FOR DELETE
    TO authenticated
    USING (public.current_user_is_superadmin());

-- ============================================================
-- 16. RECARGAR PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 17. VERIFICACIÓN (debe mostrar 't' en rowsecurity para todas)
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

-- ============================================================
-- 18. TEST RÁPIDO (ejecutar manualmente tras aplicar)
-- ============================================================
-- Como chalohiahmd (autenticado, tenant A):
--   SELECT * FROM products;
--   -- Debe devolver SOLO productos de su tenant
--
-- Como rofixinsta@gmail.com (autenticado, superadmin):
--   SELECT * FROM products;
--   -- Debe devolver TODOS los productos de TODOS los tenants
--
-- Si algo falla: ejecutar database/23_rollback_rls.sql INMEDIATAMENTE
-- =====================================================================
