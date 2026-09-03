# SOCideas — Seguridad Fase 2A

## 1. RLS de las tablas nuevas

Las cuatro tablas (`statistical_sources`, `indicator_definitions`,
`municipal_indicator_values`, `data_sync_runs`) se crean con
`ENABLE ROW LEVEL SECURITY` **sin ninguna política**. Sin políticas, PostgREST
deniega todo a `anon` y `authenticated`: no hay lectura ni escritura pública
posible, tampoco lectura para la beta. Todo acceso pasa por servidor con
`SUPABASE_SERVICE_ROLE_KEY` (rutas `/api/socideas/*` y páginas de servidor).

## 2. Lecturas permitidas

- Navegador → solo rutas de servidor (`GET /api/socideas/municipios`,
  `GET /api/socideas/perfil/[codigoINE]`), que usan `service_role` en
  servidor y devuelven JSON ya filtrado.
- Ningún componente de cliente importa `supabase-server` ni claves.
- No se creó política de lectura para `authenticated` porque la app no tiene
  autenticación efectiva (sin Supabase Auth); abrir lectura anon/auth por
  comodidad queda explícitamente descartado en esta fase.

## 3. Escrituras permitidas

- Solo `POST /api/socideas/sync/[codigoINE]` (servidor), protegido con
  `SOCIDEAS_SYNC_TOKEN` (cabecera `x-sync-token`, comparación en tiempo
  constante; sin token o token erróneo → 401). Sin token configurado → 401
  siempre.
- Un municipio por petición; 409 si hay sync en curso (< 30 min).
- Los errores al navegador son mensajes seguros (sin trazas ni URLs internas
  sensibles); el detalle queda en `data_sync_runs.error_message`.

## 4. Secretos

`SUPABASE_SERVICE_ROLE_KEY` y `SOCIDEAS_SYNC_TOKEN` solo en servidor
(`process.env` en rutas/lib servidor). `.env.example` documenta la variable
sin valores. Ningún secreto en cliente, logs ni respuestas.

## 5. Fuera de alcance (intencionado)

No se tocó RLS, políticas, funciones ni vistas de tablas existentes:
`municipios` y otras con RLS sin políticas siguen igual; la vista
`vista_resumen_planeamiento` (SECURITY DEFINER), `search_path` mutable en
`get_municipio_coords`/`resolver_territorio`, `spatial_ref_sys` sin RLS y
funciones PostGIS ejecutables por `anon` requieren una **auditoría específica
previa a cualquier apertura externa** (activar políticas sin diseñar permisos
puede romper URBideas). La lectura anon de catálogos endurecida antes
(`public_read` en 4 tablas) no se altera.
