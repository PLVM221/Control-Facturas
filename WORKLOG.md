### 2026-06-02

| Hora | Cambio |
|------|--------|
| 15:01 | feat(web): crear comparador de ventas Mercado Pago vs sistema propio |
| 15:04 | test: node --check app.js OK |
| 16:03 | fix(web): usar columnas MP K/Q y Odoo G/F por defecto |
| 16:04 | test: node --check app.js OK |
| 16:07 | feat(web): mostrar columnas Odoo A/B/C/D/F y MP Q/C en reportes |
| 16:08 | test: node --check app.js OK |
| 16:10 | chore(web): quitar selectores visibles de columnas |
| 16:11 | test: node --check app.js OK |
| 16:12 | chore(web): renombrar columnas Odoo en reportes |
| 16:12 | test: node --check app.js OK |
| 16:20 | fix(web): mostrar MP Q como Valor MP y MP D como Numero de movimiento |
| 16:20 | test: node --check app.js OK |
| 16:23 | fix(web): cruzar ventas por numero extraido de MP K y Odoo G |
| 16:23 | test: node --check app.js OK |
| 16:26 | refactor(web): simplificar columnas del reporte sin valores repetidos |
| 16:26 | test: node --check app.js OK |
| 16:31 | fix(web): no sumar duplicados de venta y quitar columnas diferencia/estado del reporte |
| 16:32 | test: node --check app.js OK |
| 16:32 | fix(web): forzar recarga de app.js y limpiar reporte al cargar archivos |
| 16:33 | test: node --check app.js OK |
| 16:34 | fix(web): quitar tolerancia y comparar cualquier diferencia exacta |
| 16:34 | test: node --check app.js OK |
| 16:35 | style(web): actualizar UI con tipografia system y estilo Apple-like |
| 16:36 | test: node --check app.js OK |
| 16:37 | chore(web): cambiar titulo a Control de facturacion |
| 16:42 | deploy(web): agregar workflow de GitHub Pages |
| 16:45 | deploy(web): habilitar GitHub Pages en gh-pages y verificar HTTP 200 |

### 2026-06-03

| Hora | Cambio |
|------|--------|
| 09:45 | refactor(web): dejar reporte solo para diferencias |
| 09:45 | refactor(web): quitar metricas de faltantes |
| 09:47 | test: node --check app.js OK |

### 2026-06-04

| Hora | Cambio |
|------|--------|
| 09:30 | feat(web): mostrar reportes con columnas Odoo A/B/C/E/G y MP Q |
| 09:30 | feat(web): agregar reporte de operaciones Odoo sin Mercado Pago |
| 09:30 | feat(web): guardar, borrar y exportar reportes guardados en Excel |
| 09:31 | test: node --check, git diff --check y prueba funcional simulada OK |
| 10:05 | feat(web): agregar reporte de ventas Odoo con Memo vacío |
| 10:25 | style(web): compactar paneles después de cargar los archivos |
| 10:40 | fix(web): tomar Total Pago desde la columna F de Odoo |
| 11:00 | fix(web): conservar posiciones físicas de columnas al leer archivos |
| 11:20 | style(web): centrar selector, encabezados y contenido de reportes |
| 11:45 | feat(web): separar acceso e historial por Rosario Centro y Alto Rosario |
| 12:10 | feat(web): preparar sincronización de reportes entre equipos con Supabase |
| 12:25 | config(web): agregar Project URL de Supabase |
| 12:35 | config(web): agregar Publishable key de Supabase |
| 12:50 | chore(web): renombrar reporte a Diferencias en Montos |
| 13:00 | chore(web): renombrar Alto Rosario a Solar |
| 13:20 | feat(web): aclarar conciliación de filas, coincidencias, vacíos y duplicados |
| 13:35 | chore(web): quitar resumen de conciliación de Mercado Pago |
| 13:50 | fix(web): permitir borrado local y reintentar sincronización con Supabase |
| 14:10 | feat(web): proteger acceso a cada puesto con contraseña |
| 14:25 | fix(web): aclarar cuando falta crear la tabla de Supabase |
