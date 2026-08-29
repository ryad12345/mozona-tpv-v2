// =====================================================================
// MOZONA TPV — vip.ts: lista de cuentas VIP con bypass permanente
// =====================================================================
// Cualquier email aquí listado tiene:
//   • Acceso permanente al TPV (nunca redirige a /pricing)
//   • Plan lifetime_vip implícito
//   • Rol owner implícito
//   • Acceso al panel admin si es SuperAdmin (configurado en .env)
//
// Esta lista se mantiene sincronizada con los grants que la BD aplica
// (ver database/07_vip_unlock.sql).
// =====================================================================

/** Emails con bypass total de suscripción (acceso permanente). */
export const VIP_EMAILS: ReadonlyArray<string> = [
    "chalohiahmd1980@gmail.com",  // El Rincón de Casablanca
    "rofixinsta@gmail.com",       // SuperAdmin del sistema
];

/** Email del SuperAdmin configurable por env. */
export const SUPERADMIN_EMAIL: string =
    (import.meta.env.VITE_SUPERADMIN_EMAIL ?? "rofixinsta@gmail.com")
        .trim()
        .toLowerCase();

/** ¿El email es VIP? (case-insensitive) */
export function isVip(email: string | null | undefined): boolean {
    if (!email) return false;
    const norm = email.trim().toLowerCase();
    return VIP_EMAILS.some(v => v.toLowerCase() === norm);
}

/** ¿El email es el SuperAdmin? */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    return email.trim().toLowerCase() === SUPERADMIN_EMAIL;
}

/** ¿El email es VIP o SuperAdmin? */
export function isVipOrAdmin(email: string | null | undefined): boolean {
    return isVip(email) || isSuperAdminEmail(email);
}
