# Acciones manuales pendientes — Fase 1 IDEAS Sostenibilidad

> Estos cambios **NO se han ejecutado** desde el código. Requieren validación de la
> preview de `feat/ideas-sostenibilidad-phase-1` y operación manual controlada.
> No renombrar nada antes de comprobar que `/`, `/urbideas`, `/socideas`,
> `/asistencias`, `/mapa`, `/municipios`, `/legislacion`, `/admin` y `/api/*`
> funcionan en la preview.

## 1. Repositorio GitHub

- Propuesta de nombre técnico: `ideas-sostenibilidad`.
- Acción: Settings → General → Repository name. GitHub redirige el nombre antiguo
  automáticamente, pero hay que actualizar clones locales (`git remote -v`) y
  referencias en Vercel/Render tras el cambio.

## 2. Proyecto Vercel

- Propuesta de nombre: `ideas-sostenibilidad`.
- Acción: Project → Settings → General → Project Name. Revisar variables de entorno
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`): no cambian en esta fase.
- URL de vista previa provisional: `ideas-sostenibilidad.vercel.app`.

## 3. Dominios

- Subdominio corporativo preferente: `sostenibilidad.ideasmedioambientales.com`
  (CNAME a `cname.vercel-dns.com`, luego Assign Domain en Vercel).
- Alternativas a valorar: `panel.ideasmedioambientales.com`,
  `herramientas.ideasmedioambientales.com`.
- Redirección recomendada (solo tras validar todo): la URL antigua
  `urb-ideas.vercel.app` debe redirigir permanentemente a la futura ruta `/urbideas`
  de la nueva aplicación (redirect 308 en Vercel → `/urbideas`).

## 4. Proyecto Supabase

- **No modificar en esta fase**: sin migraciones, sin tablas nuevas, sin cambios RLS.
- Cuando la marca esté validada, se puede valorar renombrar solo la etiqueta visible
  de `urbideas` a `ideas-sostenibilidad` (Settings → General). El `project ref` y las
  claves no cambian; si cambiara el ref, habría que rotar `NEXT_PUBLIC_SUPABASE_URL`
  en Vercel y local.

## 5. Seguridad antes de exposición pública

- Revisar RLS de `municipios`, `instrumentos_planeamiento`, `capas_wms`,
  `geo_services`, `legal_sources`, `normativa_vigente` antes de abrir nuevos módulos.
- `/admin` no tiene control de acceso en código (lectura pública actual): decidir si se
  protege con Supabase Auth + rol o se retira del despliegue público antes de anunciar
  el portal. **No se ha aplicado ningún cambio automático.**
- `NEXT_PUBLIC_CORPORATE_URL` (opcional): si se quiere apuntar el enlace corporativo a
  otra URL sin redeplegar código, definirla en Vercel; por defecto es
  `https://ideasmedioambientales.com`.

## 6. Marca y contenidos

- Favicon/manifest: no se han tocado (el proyecto usa `src/app/favicon.ico` actual).
  Cambiarlo cuando el Área valide el símbolo de IDEAS Sostenibilidad.
- Textos legales del footer: no se han inventado datos (solo aviso orientativo
  preexistente). Completar con el departamento jurídico antes de producción.
