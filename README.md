# Miel & Productos Naturales - versión Supabase

Esta versión usa Supabase como base central para que PC y celular compartan los mismos datos.

## 1) Crear las tablas
En Supabase: **SQL Editor > New query**. Copiar todo el contenido de `supabase.sql` y ejecutar **Run**.

> Si anteriormente creaste tablas llamadas `productos`, `entradas`, `ventas` y `pagos`, pueden quedar allí sin problema. Esta versión usa las tablas `products`, `entries`, `sales`, `payments` y `app_settings`.

## 2) Crear usuario
En Supabase: **Authentication > Users > Add user**. Crear el usuario con email y contraseña que usarás para entrar al sistema.

## 3) Subir a GitHub
Reemplazar en el repositorio los archivos de esta carpeta: `index.html`, `styles.css`, `app.js`, `config.js`.

No hace falta subir `supabase.sql` ni `README.md` para que la web funcione, aunque podés dejarlos en el repositorio.

## 4) Primera apertura
Abrí primero la web desde el navegador donde venías usando el sistema. Iniciá sesión. Si Supabase está vacío, la app migrará automáticamente el estado local actual (stock, entradas, ventas y pagos) a la base online.

Luego abrí la web desde el celular e iniciá sesión con el mismo usuario. Desde ese momento ambos dispositivos leen la misma base.

La app refresca datos automáticamente cada 10 segundos y también al volver a enfocarla.

## Actualización V7 - ventas y entradas con varios productos
Antes de subir esta versión, volvé a ejecutar `supabase.sql` en **Supabase > SQL Editor**. Las nuevas líneas agregan el campo `operation_id` a `entries` y `sales`; no borran los datos existentes.

Con esta versión, una entrada o venta puede contener varios productos. El historial los agrupa como una sola operación y al eliminarla se revierte el stock de todos sus renglones. Los PDF de entradas también muestran el detalle completo y el total general.
