# AUDITORÍA GENERAL MOZONA TPV — 2026-09-26

## FASE 1: SEGURIDAD ✅

### ✅ Hallazgos críticos arreglados:
- **HARDCODED_BOT_TOKEN** eliminado de `src/lib/telegramAuto.ts`.
  El token iba en el bundle JS, ahora se queda en server-side.
  Solución: nueva Edge Function `telegram-notify` con el token en Supabase secrets.

- **Tablas SIN RLS**: `waiters` y `tables_new`.
  Fix: nueva migración SQL `database/57_fix_missing_rls.sql`.
  Habilitado RLS + policies de aislamiento por tenant.

- **Edge Functions sin auth** (riesgo de abuse).
  `telegram-notify` valida JWT o service_role + rate limiting interno.

### ✅ Robot de defensa mejorado:
- Nuevo `src/lib/security/defenseBot.ts` con:
  * Honeypots ampliados (admin-secret, .env, wp-admin, etc)
  * Watchdog de performance
  * Error trap
  * Notificación admin via Edge Function
  * Auto-recovery de localStorage corrupto
  * Sincronización con tenantId dinámico

## FASE 2: ROBUSTEZ ✅

### ✅ JSON.parse sin try/catch:
- Nueva lib `src/lib/safeJson.ts` (90 líneas) con:
  * `safeJsonParse<T>()` — JSON.parse con fallback
  * `safeLocalGet/Set/Remove()` — wrappers localStorage sin excepciones
  * `safeStringify()` — JSON.stringify con detección de references circulares
- `ItemsPanel.tsx` usa safeJsonParse (3 casos)
- `TablesPanel.tsx` usa safeLocalGet/Set con validación numérica

### ✅ Verificado:
- Todos los `.delete()` están filtrados por tenant_id o id específico
- 12 operaciones de delete, ninguna es masiva
- 56 migrations SQL son idempotentes (IF NOT EXISTS)

## FASE 3: UX VISUAL ✅

### ✅ Mensajes user-friendly:
- AuthPage.tsx usa copy human-friendly
- performCharge muestra "Por favor, inténtalo de nuevo o contacta con soporte..."
- CatalogPanel empty state con botón "Ir a Configuración"
- Mensajes de error NO exponen términos técnicos al cliente

## FASE 4: ROBOT DE DEFENSA ✅

### ✅ defenseBot.ts activo:
- main.tsx llama activateDefenseBot() en el arranque
- AuthContext sincroniza tenantId con setDefenseTenant
- WAF + IDS + AutoHealer + SnapshotSentinel + SelfAudit
- Honeypots ampliados con notificaciones a Telegram admin
- Watchdogs automáticos (perf, UA, errors)

## FASE 5: PRUEBAS HUMANAS ⚠️

### ✅ Funciona:
- Página principal HTTP 200
- Bundle nuevo SHA: `37cd318b...` (625 KB)
- Token Telegram NO visible en bundle (vulnerabilidad arreglada)
- React Router navegando internamente funciona

### ⚠️ Pendiente ACCIÓN DEL CLIENTE:
- Rutas SPA (/login, /onboarding) dan 404 desde acceso directo
- Cloudflare Pages requiere configuración especial para SPA fallback
- Opciones:
  1. Cliente accede solo a `/` y navega internamente con React Router
  2. Cliente cambia Pages config: Settings → Builds → Build output dir → '.'
  3. Cliente crea Page Rules en Cloudflare Dashboard
  4. Direct Upload con Wrangler API (control total)

## ARCHIVOS PRINCIPALES MODIFICADOS/CREADOS

### NUEVOS:
- `src/lib/safeJson.ts` (90 líneas) - helper JSON/localStorage
- `src/lib/security/defenseBot.ts` (350 líneas) - robot defensa v2
- `supabase/functions/telegram-notify/index.ts` (175 líneas) - edge function
- `database/57_fix_missing_rls.sql` (80 líneas) - RLS en waiters/tables_new

### REESCRITOS:
- `src/lib/telegramAuto.ts` - usa Edge Function, sin token hardcoded

### EDITADOS:
- `src/main.tsx` - activa defenseBot v2 + activeDefense (compat)
- `src/context/AuthContext.tsx` - sync tenantId con robot
- `src/components/settings/ItemsPanel.tsx` - safeJsonParse
- `src/components/settings/TablesPanel.tsx` - safeLocal
- `src/components/settings/PrintStyles.tsx` (en cola para next iteration)
- `index.html` (raíz y dist) - sin cache-busters Z
- `public/_redirects`, `public/404.html`, `public/_headers` - SPA fallback

## ESTADÍSTICAS

- Total archivos: 1002
- LoC TS/TSX: 37,508
- SQL migrations: 57 (56 anteriores + 57_fix_missing_rls.sql)
- Edge Functions: 14 (13 anteriores + telegram-notify)
- Bundle principal: 625 KB (más grande por más fixes)

