Copia y pásale este prompt integral a tu agente de IA:
Por favor, implementa las siguientes mejoras funcionales y de usabilidad táctil en el TPV:

---

### 1. Panel de Ajustes / Configuración (Gestión de Platos, Bebidas y Mesas estilo TPV):
En la vista/modal de Ajustes (`Settings`), añade pestañas de administración rápida para el negocio:
- **Gestión de Artículos (Platos y Bebidas):**
  - Botón "Nuevo Artículo" (Nombre, Categoría/Bebida, Precio con IVA, Imagen URL / selector, Disponible Sí/No).
  - Listado editable de productos con opción de modificar precio o eliminar.
- **Gestión de Mesas y Zonas:**
  - Añadir o eliminar mesas, definir numeración y asignar zona (Sala, Terraza, Barra).
- **Gestión de Categorías:**
  - Crear categorías (Entrantes, Carnes, Pescados, Bebidas, Postres, etc.) y ordenar su posición.

---

### 2. Botón global "Volver al TPV" (Navegación segura):
- En todas las pantallas secundarias (Ajustes, Informes, Cierre de Caja, Facturas):
  - Añade un botón visible y táctil en la cabecera superior izquierda:
    `<button onClick={() => navigate('/app')} className="h-10 px-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-white font-bold rounded-xl flex items-center gap-2"> ⬅ VOLVER AL TPV </button>`
  - Asegura que nunca quede una pantalla sin vía de retorno directa.

---

### 3. Scroll Táctil Asistido con Botones en toda la plataforma:
En pantallas táctiles el arrastre manual a veces falla; añade botones táctiles de desplazamiento:
- **Catálogo de Platos:** Dos botones flotantes o en esquina (`▲ Arriba` y `▼ Abajo` de tamaño `w-10 h-10 rounded-xl shadow-md`) para desplazar la cuadrícula de comida sin depender exclusivamente del dedo.
- **Comanda:** Botones táctiles `▲ / ▼` para subir y bajar por las líneas de pedido cuando la comanda es larga.
- **Categorías superiores:** Mantener las flechas táctiles `◀` y `▶` con desplazamiento suave.

---

### 4. Ajustes finales en el layout POS (`PosTerminalPro.tsx`, `CatalogPanel.tsx`, `PaymentPanel.tsx`):
- **Borde izquierdo del catálogo:** Asegurar `p-2` sin márgenes negativos para que `"Ensalada Rusa"` y su precio no se corten en la primera tarjeta.
- **Platos en 4 columnas:** Usar `grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 p-1` para llenar el 70% del ancho.
- **Panel de Cobro inferior (50% de alto):**
  - Reducir las teclas numéricas a `h-8 text-sm font-bold`.
  - Botones de acción inferiores compactos (`h-8 text-xs font-bold`) para que "EFECTIVO", "TARJETA / DATÁFONO" y "EMITIR FACTURA" queden 100% visibles sin salirse por abajo.

---

### Validación y Despliegue:
Ejecuta `npm run build` y, si compila limpio:
```bash
git add .
git commit -m "feat: gestion de platos/mesas en ajustes, navegacion de retorno y scroll tactil asistido"
git push origin main


---

Una vez aplicado, la pantalla principal tendrá el catálogo sin recortes con scroll táctil, el teclado encajará al milímetro y desde Ajustes podrás dar de alta nuevos platos, bebidas y mesas con botón de vuelta inmediata al terminal.

