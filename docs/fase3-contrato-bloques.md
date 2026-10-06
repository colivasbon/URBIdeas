# Fase 3 — Contrato de bloques, estados, snapshot y almacenamiento

## 1. Bloques (código estable; la matriz documental vive en `docs/fase3-matriz-bloques.md`)

| Código | Nombre | Fase | Vía |
|---|---|---|---|
| `limites` | Términos municipales | 1 | IGN AU (WFS) |
| `poblacion` | Padrón INE (observación anual, sin coordenadas) | 1 | INE Tempus3 DPOP |
| `hidrografia` | Red hidrográfica IGR (miembros, no cauces) | 1 | IGN hidro WFS (Fase 2A) |
| `inundabilidad` | SNCZI/PATRICOVA (raster + SHP CV) | 1 | MITECO/IDEE + GVA |
| `depuradoras` | EDAR (PRTR ≥100k e-h + agregación CCAA) | 1 | PRTR + CCAA |
| `combustible` | Estaciones de servicio | 1 | MINETUR |
| `recarga` | Puntos de recarga eléctrica | 1 | NAP DATEX2 + RIPREE |
| `educacion` | Centros educativos | 1 | RCD/CCAA + RUCT (ficha) |
| `sanidad` | Centros sanitarios | 1 | REGCESS |
| `farmacias` | Oficinas de farmacia | 1 | REGCESS-E (parcial; BOT PLUS no abierto) |
| `carreteras`, `ferrocarril`, `autobus`, `deporte`, `cultura`, `turismo`, `sociosanitario`, `administracion`, `nucleos`, `incendios` | Fase 2 | 2 | Nacional/autonómica según evidencia |
| `caminos`, `puertos`, `aeropuertos`, `comercio`, `religioso`, `residuos`, `subestaciones`, `telecom`, `mercancias`, `industrial`, `deslizamientos`, `planes`, `agua` | Fase 3 | 3 | Mixta/débil; candidato con motivo si no hay evidencia |
| `hidrantes`, `transformadores`, `autoproteccion`, `redes_nucleo`, `organizacion`, `recursos`, `evacuacion`, `voluntariado`, `eventos`, `vulnerables` | Fase 4 | 4 | Aportación municipal (plantilla + importación) |

## 2. Estados por municipio y bloque (exhaustivos)

`cargado` · `cargado_parcial` · `sin_cobertura` · `no_aplicable` ·
`fuente_caida` · `cero_resultados` · `pendiente_aportacion`.

Cero resultados no significa ausencia de peligro, infraestructura o
publicación. Ninguna fuente que falla borra la última versión válida.

## 3. Reparto R2 / Supabase

- **R2** (`incideas/`): descargas originales por fuente+edición+municipio con
  checksum; geometrías y capas por municipio; artefactos de exportación;
  plantillas. Nada pesado en Supabase.
- **Supabase**: `incideas_bloques`, `incideas_fuentes_nac` (la `incideas_fuentes`
  existente, registro de conectores del piloto, no se toca), `incideas_cobertura`
  (control: municipio+bloque+fuente+edición+estado+tiempos+objetos+errores+
  reintentos+versión conector), `incideas_entidades` (índice liviano con
  `atributos` JSONB y punto/bbox, sin geometrías pesadas),
  `incideas_snapshots`, `incideas_aportaciones`.
- Presupuesto: Supabase ~178/500 MB ocupados (asociaciones 126 MB,
  data_sync_runs 31 MB); R2 147.256 objetos / 2,97 GB. Las entidades nuevas
  son filas de <1 KB: 8.132 municipios × 10 bloques × ~20 entidades ×
  0,5 KB ≈ 800 MB **no cabe** en Supabase → las entidades viven en R2 por
  municipio y en Supabase solo índices agregados + control. Decisión
  documentada antes de cargar.

## 4. Snapshot

Identificador `incideas:snap:<sha1>` derivado de (ediciones de fuentes +
hash del inventario + versión de algoritmo). Web y exportaciones leen la
misma snapshot aprobada. Una marca de hora por petición no es snapshot.

## 5. Cargas y actualización

Lotes idempotentes con paginación, reintentos con espera, tasa limitada y
reanudación; nunca dentro de una petición web; OSM por extractos, nunca por
visita. Programada por fuente (diaria precios/alertas, mensual registros,
anual cartografía) + manual por municipio y bloque en segundo plano. Un fallo
no borra; una desaparición exige extracción válida y completa.

## 6. Privacidad y seguridad

Sin teléfonos, responsables, accesos ni dispositivos internos en lo público;
exportación pública separada de la interna con control de acceso real; sin
datos individuales de vulnerabilidad; nada es «albergue/itinerario/recurso
operativo» sin designación formal.
