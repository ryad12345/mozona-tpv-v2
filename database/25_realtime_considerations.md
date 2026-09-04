# MOZONA TPV — Consideraciones de Realtime con RLS

## Resumen

Las políticas RLS del script `22_rls_hardening_safe.sql` se aplican también al canal Realtime de Supabase (WebSocket `postgres_changes`). Si los clientes usan `supabase.channel('...').on('postgres_changes', ...)`, **deben seguir las mismas reglas que el REST**.

## ¿Por qué Realtime respeta RLS?

PostgREST + Realtime usan los mismos permisos de Postgres. Cuando un cliente abre un canal Realtime con su JWT, el motor de Realtime evalúa las políticas RLS **en cada evento recibido** antes de enviarlo al cliente. Si una política niega la lectura, el evento NO se envía.

## Canales Realtime usados en MOZONA TPV

| Canal | Tabla | Suscriptores | RLS impacta |
|-------|-------|--------------|-------------|
| `orders-changes` | `orders` | TPV (cocina + caja) | sí |
| `products-changes` | `products` | TPV carta | sí |
| `categories-changes` | `categories` | TPV carta | sí |
| `dining-tables-changes` | `dining_tables` | TPV mesas | sí |
| `tenant-users-changes` | `tenant_users` | admin panel | sí |

## Pruebas manuales tras activar RLS

### 1. Verificar que un cliente recibe eventos de su tenant

```
Login como chalohiahmd (tenant A)
Abrir TPV
Insertar producto desde otra ventana (Supabase Dashboard) con tenant_id = A
El producto debe aparecer en la carta en menos de 1s
```

### 2. Verificar que NO recibe eventos de otro tenant

```
Login como chalohiahmd (tenant A)
Insertar producto desde otra ventana con tenant_id = B
El producto NO debe aparecer en la carta
```

### 3. Verificar Realtime de mesas

```
Login como chalohiahmd
Cambiar estado de mesa 5 en otra ventana
El cambio debe reflejarse en la grid de mesas en menos de 1s
```

### 4. Verificar Realtime de orders (cocina)

```
Login como chalohiahmd
Enviar una comanda desde /waiter
El plato debe aparecer en la pantalla de cocina del TPV
```

## Posibles problemas y soluciones

### Problema: "no me llegan los eventos de Realtime"

**Causa 1**: El cliente no tiene `auth.uid()` válido en el canal. Verificar:
```ts
const channel = supabase.channel('orders-changes', {
    config: { presence: { key: auth.user?.id } }
});
```

**Causa 2**: El `filter` del canal no coincide con el `tenant_id` del cliente:
```ts
.on('postgres_changes',
    { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
    handler
)
```

**Causa 3**: La política RLS excluye filas con `tenant_id` NULL. Verificar que el INSERT siempre envíe `tenant_id`.

**Causa 4**: La política RLS de SELECT exige `tenant_id = get_user_tenant_id(auth.uid())` y el cliente no está en `tenant_users`. El usuario debe existir en `tenant_users` con el `user_id` correcto.

### Problema: "Realtime se desconecta tras activar RLS"

**Causa**: El cliente puede seguir conectado pero no recibir eventos porque falla la verificación RLS silenciosamente. Revisar logs del navegador:
```
console.log del cliente: "new events from realtime"
console.error: "permission denied for table orders"
```

## Recomendaciones operativas

1. **Hacer las pruebas de Realtime en la ventana de mantenimiento** antes de cerrar.
2. **Mantener logs activos** durante las primeras 24h tras activar RLS.
3. **Tener el rollback (`23_rollback_rls.sql`) listo** en una pestaña del navegador.
4. Si un camarero reporta "no me carga la carta" tras activar RLS, lo más probable es que su `user_id` no esté en `tenant_users`. Solución: ejecutar la migración `04_waiters.sql` o el alta manual desde `/admin/invites`.

## Realtime + service_role

El `service_role` bypasa RLS por diseño en Postgres. Los Edge Functions (`waiter-api`, etc.) que usen `service_role` seguirán pudiendo hacer broadcast a Realtime sin restricciones.
