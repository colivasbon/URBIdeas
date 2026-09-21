# SOCideas — Catálogo de fuentes v4 (Fase 3)

> Registro consolidado de fuentes. **Sin secretos.** Verificado en vivo salvo indicación contraria
> (fecha entre paréntesis). Todas las claves territoriales son `codigo_ine` de 5 dígitos (string con
> ceros iniciales); **nunca** el nombre del municipio.

## A. Fuentes VIABLES de prioridad alta (Fase 3)

| Indicador / bloque | Tabla / endpoint | Ámbito | Cobertura nacional | Frecuencia | Último periodo | Estado | Limitaciones |
|---|---|---|---|---|---|---|---|
| Saldo migratorio (total/exterior/interior, por sexo) | INE Tempus3 **69767** (`DATOS_TABLA`/`SERIES_TABLA`; var. `Provincia y Municipio`, `Sexo`, `Tipo de saldo`) | Municipio | 8.132/8.132 (auditoría 2026-09-11) | Anual | 2021–2024 | **Apta; pendiente de carga** | Complementa (no sustituye) 69711/69743/69746; es saldo, no flujo |
| Renta de declarantes: nº declaraciones, renta bruta/disponible media | AEAT **EDM** · `.../irpfmunicipios/{año}/home.html` (+ ANEXO Excel) | Municipio >1.000 hab., **régimen común** | Sí, con umbral; **excluye País Vasco y Navarra** | Anual | 2023 (pub. sep-2025) | **Apta; conector parcial** (`src/lib/aeat-irpf.ts`) | Renta **por declaración**, no por persona/hogar; no mezclar con ADRH |
| Censo Agrario 2020 — cultivos/superficie | INE PC-Axis **`jaxi/Tabla.htm?tpx=52071`** · CSV masivo `jaxi/files/tpx/es/csv_bd/52071.csv` (16,7 MB) | Municipio | Nacional (CSV único) | Decenal (estructural) | 2020 | **Apta; pendiente de conector** | CSV PC-Axis usa **nombre** de municipio → resolver join por código; secretos → ND |
| Censo Agrario 2020 — ganadería | **`tpx=52076`** · CSV 11,0 MB | Municipio | Nacional | Decenal | 2020 | **Apta** | idem |
| Censo Agrario 2020 — jefes por sexo | **`tpx=52081`** · CSV 5,3 MB | Municipio | Nacional | Decenal | 2020 | **Apta** | idem |
| Censo Agrario 2020 — formación agraria | **`tpx=52082`** · CSV 4,9 MB | Municipio | Nacional | Decenal | 2020 | **Apta** | idem |
| Nivel de estudios (Censo 2021) | INE PC-Axis **`tpx=55249`** · CSV `.../csv_bd/55249.csv` (44,3 MB) | Municipio | Nacional | Decenal | 2021 | **Apta; pendiente de conector** | idem; "No aplicable (<15)" fuera de % educativos |
| Banda ancha (cobertura) | SETELECO · «Cobertura Banda Ancha España 2021-2025» XLSX | Municipio | Nacional (desglose municipal) | Anual | 2021–2025 | **Apta; pendiente de verificar código INE en el XLSX** | — |
| Padrón por sexo/edad/nacionalidad (NAC-MUN) | INE **33570** (edad), **33571** (español/extranjero), **33572** (nacionalidad principales), **33573** (país nacimiento) | Municipio | Nacional (una tabla por indicador) | Anual | según tabla | **Preferibles** a las familias `PROV-MUN` | — |
| Renta/desigualdad ADRH | INE ADRH (familia provincial; `src/lib/adrh-province-tables.json`) | Municipio/≥100 hab. Gini | Sí | Anual | 2023 | En producción (Fase 2B) | Renta media sin umbral desde 2020; Gini ≥100 hab. |

## B. Fuentes BLOQUEADAS (sin cobertura nacional municipal estructurada)

| Bloque | Motivo | Evidencia |
|---|---|---|
| Gobierno local vigente (alcalde/partido) | Sin API nacional; RER (MPT) solo web; fragmentado por CCAA | §2.3 reconcilación |
| Nacimientos / defunciones / saldo vegetativo | INE **31934/31917** solo «Capitales y principales municipios» | `GRUPOS_TABLA/*` (2026-09-21) |
| Recursos sanitarios y sociales | Sin registro estatal único; 17 servicios de salud | — |
| Patrimonio cultural (BIC) | Inventarios por CCAA | — |
| Alojamientos / demanda turística | EOH municipal = «puntos turísticos» (no-INE); CCAA sí | `docs/socideas-hosteleria-bloqueada.md` |
| Directorio asociativo | RNA solo «Fichero de Denominaciones» (nombres), sin directorio municipal | datos.gob.es |
| Hostelería (op. 238 EOH/Frontur) | `Codigo="MUN"` no es nomenclátor INE | `docs/socideas-hosteleria-bloqueada.md` |
| Presupuestos Hacienda (carga) | Fuente oficial (SGCIEF) pero descarga masiva por INE sin confirmar | §0.1 H5 |
| Viaria / ferrocarril / energía | MITECO/CNMC/REE sin dataset municipal unificado | — |

## C. Reglas transversales

1. Clave territorial **siempre** `codigo_ine` (string, 5 dígitos). Nunca el nombre.
2. Nunca atribuir un dato provincial/autonómico a un municipio.
3. Ausencia/secreto → `missing`/ND con explicación; **nunca 0**.
4. R2 v2 obligatorio (`socideas/v2/municipios/{ine}.json`); preservar el envelope existente.
5. Toda escritura: backup/read-back/manifest/checksum + `data_sync_runs`.
6. Verificar en vivo antes de cargar; si no hay cobertura nacional real → bloquear, no forzar.
