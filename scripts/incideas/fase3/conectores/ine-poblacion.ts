// Fase 3 — Bloque población: reutiliza la serie INE ya cargada en R2.
//
// No descarga el INE de nuevo ni escribe `municipios.poblacion` (auditoría
// §6 pendiente): lee el envelope v2 del municipio y publica la última
// observación validada de `population_total` con su procedencia.

import { expandV2Envelope } from "../../../../src/lib/socideas-r2";

export interface ObservacionPoblacion {
  anio: number;
  valor: number;
  unidad: string;
  fuente: string;
  tabla: string | null;
  url: string | null;
}

export async function cargarPoblacion(
  ine: string,
  basePublica: string
): Promise<{ objetos: ObservacionPoblacion[]; edicion: string; nota: string }> {
  const r = await fetch(`${basePublica}/socideas/v2/municipios/${ine}.json`, { headers: { "User-Agent": "INCideas-Fase3/0.1" } });
  if (!r.ok) {
    return { objetos: [], edicion: "", nota: `Sin envelope R2 para ${ine} (HTTP ${r.status}): sin_cobertura.` };
  }
  const env = (await r.json()) as Parameters<typeof expandV2Envelope>[0];
  const filas = expandV2Envelope(env);
  const slugDe = (f: Record<string, unknown>): string => {
    const ind = f["indicator"];
    return ind !== null && typeof ind === "object" && !Array.isArray(ind)
      ? String((ind as Record<string, unknown>)["slug"] ?? "")
      : "";
  };
  const pob = filas.filter((f) => slugDe(f) === "population_total" && f["estado_validacion"] === "validado");
  const porAnio = [...pob].sort((a, b) => Number(b["anio_referencia"] ?? 0) - Number(a["anio_referencia"] ?? 0));
  const ultima = porAnio[0];
  if (!ultima) return { objetos: [], edicion: "", nota: `Envelope sin population_total validada para ${ine}.` };
  const fuente = ultima["source"];
  const organismo =
    fuente !== null && typeof fuente === "object" && !Array.isArray(fuente)
      ? String((fuente as Record<string, unknown>)["organismo"] ?? "INE")
      : "INE";
  return {
    objetos: [
      {
        anio: Number(ultima["anio_referencia"] ?? 0),
        valor: Number(ultima["valor_numerico"] ?? 0),
        unidad: String(ultima["unidad"] ?? "personas"),
        fuente: organismo,
        tabla: typeof ultima["source_table_id"] === "string" ? (ultima["source_table_id"] as string) : null,
        url: typeof ultima["source_url"] === "string" ? (ultima["source_url"] as string) : null,
      },
    ],
    edicion: String(ultima["anio_referencia"] ?? ""),
    nota: "Último padrón validado en R2; municipios.poblacion no se usa.",
  };
}
