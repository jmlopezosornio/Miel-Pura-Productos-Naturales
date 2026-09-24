# Miel & Productos Naturales — versión 1.9

## Novedades

- La pestaña **Pagos** anterior ahora se llama **Cobranza** y sigue registrando pagos de clientes.
- Nueva pestaña **Pagos** para proveedores.
- Las nuevas **Entradas** incluyen el campo **Proveedor**.
- La deuda a proveedores se calcula automáticamente como **total de entradas - pagos a proveedores**.
- Se muestra el saldo individual de cada proveedor.
- Cada pago a proveedor puede incluir un **comprobante PDF o imagen** de hasta 8 MB.
- Si un pago se creó sin comprobante, se puede usar **Adjuntar** más adelante.
- Los comprobantes se guardan en un bucket privado de Supabase y solo usuarios autenticados pueden acceder.

## IMPORTANTE — actualización de Supabase

Antes de publicar esta versión, abrí **Supabase > SQL Editor > New query**, copiá todo el contenido de `supabase.sql` y ejecutalo con **Run**.

El script es reejecutable y agrega:

- columna `supplier` en `entries`;
- tabla `supplier_payments`;
- bucket privado `supplier-payment-receipts`;
- políticas de seguridad para usuarios autenticados.

No borra las ventas, entradas, productos ni cobranzas existentes.

## Entradas antiguas

Las entradas creadas antes de esta versión no tienen proveedor asociado y aparecerán como **Sin proveedor**. Las nuevas entradas pedirán obligatoriamente el proveedor para poder calcular correctamente la deuda.

## Publicación

Después de ejecutar el SQL, reemplazá en GitHub los archivos de la versión anterior por:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`

`supabase.sql` no necesita subirse para que la web funcione, aunque es útil conservarlo en el repositorio como respaldo del esquema.


## Versión 2.0
- Logo Miel Pura integrado en la interfaz y en los comprobantes PDF de entradas y ventas.
- Stock: botones de editar y eliminar. La eliminación solo se habilita cuando el stock es exactamente 0; se realiza como baja lógica para conservar el historial de operaciones.
- PDF de entradas: agrega la columna Presentación y queda ordenado como Producto, Presentación, Cantidad, Costo unitario y Costo total.
- No requiere cambios adicionales en Supabase respecto de la versión 1.9/V10.
