// INCideas — reutilización de datos transversales de SOCideas.
//
// SOCideas ya publica, por municipio, un envelope en R2 con indicadores
// oficiales (INE, AEAT, etc.). INCideas NO los duplica: los consume para las
// secciones de la memoria que coinciden (situación geográfica, población).
import { readMunicipioJson, expandV2Envelope } from "@/lib/socideas-r2";

export interface SerieIndicador {
  anio: number;
  valor: number | null;
  dimensiones?: Record<string, string>;
}

export interface IndicadorSocideas {
  slug: string;
  nombre: string;
  unidad: string | null;
  ultimoAnio: number | null;
  ultimoValor: number | null;
  serie: SerieIndicador[];
  generadoEn: string | null;
}

export type IndicadoresSocideas = Map<string, IndicadorSocideas>;

interface FilaExp {
  anio_referencia: number;
  valor_numerico: number | null;
  dimensiones: Record<string, string>;
  indicator: { slug: string; nombre: string; unidad: string | null };
}

/** Lee el envelope R2 de SOCideas y devuelve sus indicadores agrupados por slug. */
export async function getIndicadoresSocideas(codigoINE: string): Promise<IndicadoresSocideas> {
  const mapa: IndicadoresSocideas = new Map();
  try {
    const env = (await readMunicipioJson(codigoINE)) as unknown as {
      version?: number;
      generado_en?: string;
    } | null;
    if (!env) return mapa;

    const filas: FilaExp[] =
      env.version === 2
        ? (expandV2Envelope(env as never) as unknown as FilaExp[])
        : [];
    const generado = env.generado_en ?? null;

    for (const f of filas) {
      const slug = f.indicator?.slug;
      if (!slug) continue;
      let ind = mapa.get(slug);
      if (!ind) {
        ind = {
          slug,
          nombre: f.indicator.nombre,
          unidad: f.indicator.unidad,
          ultimoAnio: null,
          ultimoValor: null,
          serie: [],
          generadoEn: generado,
        };
        mapa.set(slug, ind);
      }
      if (f.valor_numerico !== null) {
        ind.serie.push({
          anio: f.anio_referencia,
          valor: f.valor_numerico,
          dimensiones: f.dimensiones,
        });
      }
    }

    for (const ind of mapa.values()) {
      ind.serie.sort((a, b) => a.anio - b.anio);
      const conValor = ind.serie.filter((s) => s.valor !== null);
      const ultimo = conValor[conValor.length - 1];
      if (ultimo) {
        ind.ultimoAnio = ultimo.anio;
        ind.ultimoValor = ultimo.valor;
      }
    }
    return mapa;
  } catch {
    return mapa;
  }
}

export function valorSocideas(
  inds: IndicadoresSocideas,
  slug: string
): { valor: number | null; anio: number | null } {
  const ind = inds.get(slug);
  return { valor: ind?.ultimoValor ?? null, anio: ind?.ultimoAnio ?? null };
}
