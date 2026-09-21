# Miel & Productos Naturales — mini sistema de gestión

Primera versión basada en el Excel entregado. Incluye:

- Dashboard con stock valorizado, ventas y saldo a cobrar.
- Productos y stock.
- Entradas de mercadería (suman stock).
- Ventas (descuentan stock).
- Pagos/cobranzas.
- Alertas de stock bajo.
- Exportación de copia JSON.
- Modo local inmediato y soporte para Supabase.

## 1. Probar sin configurar nada

Subí `index.html`, `styles.css`, `app.js` y `config.js` a un repositorio de GitHub y activá GitHub Pages. La aplicación funcionará en `Modo local` y guardará la información en el navegador mediante localStorage.

IMPORTANTE: en modo local, cada navegador/equipo tiene su propia copia. Para compartir los mismos datos entre PC y celular, configurá Supabase.

## 2. Conectar Supabase

1. Crear un proyecto en https://supabase.com
2. Abrir **SQL Editor** y ejecutar el contenido completo de `supabase.sql`.
3. En Supabase: **Authentication > Users** crear al menos un usuario (email y contraseña).
4. En Supabase: **Project Settings > API** copiar:
   - Project URL
   - anon/public key
5. Editar `config.js`:

```js
window.APP_CONFIG = {
  USE_SUPABASE: true,
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "tu-clave-anon"
};
```

6. Volver a subir `config.js` a GitHub. Al abrir el sistema solicitará el email y contraseña creados en Supabase.

## Datos iniciales

La tabla de productos fue cargada tomando como punto de partida la hoja **Stock** del Excel. Se importó el stock actual como saldo inicial, para evitar duplicar el descuento de las ventas históricas.

El Excel mostraba además una deuda de referencia de $475.000. Esta se utiliza solamente en modo local como saldo inicial para el indicador de “Saldo a cobrar”. Al pasar a Supabase, conviene luego migrar clientes/cuentas corrientes de forma explícita.

## Próxima versión sugerida

- Clientes y cuentas corrientes individuales.
- Proveedores.
- Venta con varios productos en un mismo comprobante.
- Historial/edición/anulación de movimientos.
- Reportes mensuales y ganancias.
- Usuarios/login y políticas de seguridad por usuario.
