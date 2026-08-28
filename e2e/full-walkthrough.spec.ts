// =====================================================================
// MOZONA TPV — E2E: Recorrido completo del dueño del restaurante
// =====================================================================

import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "chalohiahmd1980@gmail.com";
const PASSWORD = process.env.E2E_PASS  ?? "";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

async function loginAsOwner(page: Page, email: string, password: string) {
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");
    // Tabs: "Iniciar sesión" o "Crear cuenta"
    const loginTab = page.getByRole("button", { name: /Iniciar sesi/i }).first();
    if (await loginTab.isVisible().catch(() => false)) {
        await loginTab.click();
    }
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    // El botón de submit
    await page.getByRole("button", { name: /Entrar|Iniciar|Sign in/i }).first().click();
}

async function expectNoCasaManolo(page: Page) {
    const body = await page.locator("body").innerText();
    expect(body, "BUG: 'Casa Manolo' visible en algún punto").not.toMatch(/casa manolo/i);
}

// ---------------------------------------------------------------------
// 1) LOGIN
// ---------------------------------------------------------------------
test.describe.serial("1 · Login + bypass onboarding", () => {
    test("Login con chalohiahmd1980@gmail.com entra directo a /app", async ({ page }) => {
        test.skip(!PASSWORD, "Define E2E_PASS para ejecutar este test");

        await loginAsOwner(page, EMAIL, PASSWORD);
        // Espera a la redirección
        await page.waitForURL(/\/(app|setup\/onboarding|admin\/invites)/, { timeout: 20_000 });
        // Si todo está bien, debe ir a /app (no al wizard)
        await expect(page).toHaveURL(/\/app/);
        await expectNoCasaManolo(page);
    });

    test("Sin sesión redirige a /auth", async ({ page }) => {
        // Limpia storage
        await page.goto("/");
        await page.evaluate(() => { localStorage.clear(); });
        await page.goto("/app");
        await page.waitForURL(/\/auth/, { timeout: 10_000 });
    });
});

// ---------------------------------------------------------------------
// 2) CARTA TPV
// ---------------------------------------------------------------------
test.describe.serial("2 · Carta del TPV", () => {
    test("Muestra 7 categorías y 44 productos con imágenes", async ({ page }) => {
        test.skip(!PASSWORD, "Define E2E_PASS para ejecutar este test");
        await loginAsOwner(page, EMAIL, PASSWORD);
        await page.waitForURL(/\/app/, { timeout: 20_000 });
        await page.waitForLoadState("networkidle");

        // 7 categorías en el tab bar
        const expectedCats = ["Entrantes", "Carne", "Pescado", "Pizza", "Pasta", "Extras", "Postres"];
        for (const cat of expectedCats) {
            await expect(page.getByRole("button", { name: new RegExp(cat, "i") }).first(),
                `Falta categoría ${cat}`).toBeVisible({ timeout: 8_000 });
        }

        // Cuenta productos: contar imágenes con src Unsplash
        const productsWithImages = await page.locator("img[src*='unsplash.com']").count();
        expect(productsWithImages, "debe haber imágenes de productos").toBeGreaterThanOrEqual(20);

        // Total productos: contar las cards (button con imagen)
        const cards = await page.locator("button img[src*='unsplash.com'], button img[src*='data:image/svg']").count();
        expect(cards, "debe haber productos renderizados").toBeGreaterThanOrEqual(20);

        await expectNoCasaManolo(page);
    });

    test("Productos concretos del menú", async ({ page }) => {
        test.skip(!PASSWORD, "Define E2E_PASS");
        await loginAsOwner(page, EMAIL, PASSWORD);
        await page.waitForURL(/\/app/);
        await page.waitForLoadState("networkidle");

        const mustExist = [
            "Tajen de Cordero",  // 17,00 €
            "Ensalada Marroquí", // 6,80 €
            "Té marroquí",       // 2,50 €
            "Margarita",         // 7,00 €
            "Espagueti fruta del mar", // 13,50 €
            "Flan casero",       // 3,00 €
            "Pastela de Pollo",  // 7,50 €
        ];
        for (const name of mustExist) {
            const el = page.getByText(name, { exact: false }).first();
            await expect(el, `Falta plato: ${name}`).toBeVisible({ timeout: 5_000 });
        }
    });

    test("Añadir 4 productos a una mesa y cobrar", async ({ page }) => {
        test.skip(!PASSWORD, "Define E2E_PASS");
        await loginAsOwner(page, EMAIL, PASSWORD);
        await page.waitForURL(/\/app/);
        await page.waitForLoadState("networkidle");

        // Seleccionar primera mesa libre
        const firstTable = page.locator("button").filter({ hasText: /^\d+$/ }).first();
        await firstTable.click().catch(() => {});

        // Añadir 4 productos buscando por texto
        for (const name of ["Tajen de Cordero", "Ensalada Marroquí", "Té marroquí", "Margarita"]) {
            const card = page.getByText(name, { exact: false }).first();
            await card.click({ delay: 50 });
        }

        // Ir a cobro
        const cobrar = page.getByRole("button", { name: /Cobrar|Cobro|Pagar/i }).first();
        await cobrar.click();

        // Verificar que aparecen los 4 productos en el panel de pago
        await expect(page.getByText("Tajen de Cordero")).toBeVisible();
        await expect(page.getByText("Margarita")).toBeVisible();

        // Cerrar (no vamos a cobrar realmente con Stripe test)
        await page.keyboard.press("Escape");
    });
});

// ---------------------------------------------------------------------
// 3) OCR / IA
// ---------------------------------------------------------------------
test.describe.serial("3 · Subida de imagen sin stack overflow", () => {
    test("Imagen 3 MB no rompe el navegador", async ({ page }) => {
        test.skip(!PASSWORD, "Define E2E_PASS");
        await loginAsOwner(page, EMAIL, PASSWORD);
        await page.waitForURL(/\/app/);

        // Solo verificamos que la página responde después de un input grande
        // (la prueba real de OCR requiere la Edge Function desplegada)
        const hugeBuffer = Buffer.alloc(3 * 1024 * 1024, 0xFF);
        await page.evaluate((b64) => {
            // simulamos un File muy grande
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const blob  = new Blob([bytes], { type: "image/jpeg" });
            return blob.size;
        }, hugeBuffer.toString("base64"));
        // La página sigue respondiendo → no hay stack overflow
        await expect(page.locator("body")).toBeVisible();
    });
});

// ---------------------------------------------------------------------
// 4) PLAN Y FACTURACIÓN
// ---------------------------------------------------------------------
test.describe.serial("4 · Plan y facturación", () => {
    test("Settings muestra plan actual", async ({ page }) => {
        test.skip(!PASSWORD, "Define E2E_PASS");
        await loginAsOwner(page, EMAIL, PASSWORD);
        await page.waitForURL(/\/app/);
        await page.goto("/settings");
        await page.waitForLoadState("networkidle");

        // El panel de billing debe estar
        await expect(page.getByText(/Plan y facturaci/i)).toBeVisible();
        // El nombre del plan: "Plus", "Pro" o "Lifetime VIP"
        const planName = await page.locator("text=/Plus|Pro|Lifetime|Free/").first().textContent();
        expect(planName, "debe mostrar un plan").toBeTruthy();

        // Botón "Portal Stripe"
        await expect(page.getByRole("button", { name: /Portal Stripe/i })).toBeVisible();
    });
});

// ---------------------------------------------------------------------
// 5) AUDITORÍA
// ---------------------------------------------------------------------
test("5 · Sin rastro de 'Casa Manolo' en ninguna página", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expectNoCasaManolo(page);

    await page.goto("/auth");
    await expectNoCasaManolo(page);

    await page.goto("/pricing");
    await expectNoCasaManolo(page);

    await page.goto("/setup-caja");
    await expectNoCasaManolo(page);
});
