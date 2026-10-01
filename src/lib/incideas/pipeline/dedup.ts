export interface CandidatoDedup {
  id: string;
  nombre_normalizado: string;
  categoria: string;
  fuente: string;
  id_origen?: string | null;
  telefono_normalizado?: string | null;
  coordenadas?: { lat: number; lng: number } | null;
}

export type TipoDuplicado =
  | "duplicado_exacto"
  | "posible_duplicado"
  | "mismo_recurso_varias_fuentes"
  | "varias_sedes_misma_entidad"
  | "mismo_nombre_distinta_ubicacion";

export interface GrupoDuplicado {
  tipo: TipoDuplicado;
  ids: string[];
  motivo: string;
  distancia_max_m?: number;
}

function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface DedupOpciones {
  /** Distancia por debajo de la cual dos registros del mismo nombre se consideran el mismo lugar. */
  umbralMismoLugarM?: number;
}

/**
 * Detección conservadora. No fusiona: devuelve grupos para revisión humana.
 * - duplicado_exacto: misma fuente + id_origen (no debería ocurrir tras upsert).
 * - mismo_recurso_varias_fuentes: mismo nombre + teléfono + cerca, fuentes distintas.
 * - posible_duplicado: mismo nombre + categoría + cerca, criterio más laxo.
 * - varias_sedes_misma_entidad: mismo nombre, lejos, misma fuente.
 * - mismo_nombre_distinta_ubicacion: mismo nombre, lejos, fuentes distintas.
 */
export function detectarDuplicados(
  registros: CandidatoDedup[],
  opciones: DedupOpciones = {}
): GrupoDuplicado[] {
  const umbral = opciones.umbralMismoLugarM ?? 150;
  const grupos: GrupoDuplicado[] = [];
  const usados = new Set<string>();

  // 1. Duplicado exacto por fuente + id_origen
  const porClave = new Map<string, CandidatoDedup[]>();
  for (const r of registros) {
    if (!r.id_origen) continue;
    const k = `${r.fuente}|${r.id_origen}`;
    (porClave.get(k) ?? porClave.set(k, []).get(k)!).push(r);
  }
  for (const [k, arr] of porClave) {
    if (arr.length > 1) {
      grupos.push({
        tipo: "duplicado_exacto",
        ids: arr.map((r) => r.id),
        motivo: `Misma clave fuente+id_origen (${k})`,
      });
      arr.forEach((r) => usados.add(r.id));
    }
  }

  // 2. Comparaciones por nombre normalizado + categoría
  const porNombre = new Map<string, CandidatoDedup[]>();
  for (const r of registros) {
    if (!r.nombre_normalizado) continue;
    const k = `${r.categoria}|${r.nombre_normalizado}`;
    (porNombre.get(k) ?? porNombre.set(k, []).get(k)!).push(r);
  }

  for (const [, arr] of porNombre) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (a.id === b.id) continue;
        if (a.fuente === b.fuente && a.id_origen && a.id_origen === b.id_origen) continue;

        const mismaFuente = a.fuente === b.fuente;
        const telIgual =
          !!a.telefono_normalizado &&
          a.telefono_normalizado === b.telefono_normalizado;
        let dist: number | null = null;
        if (a.coordenadas && b.coordenadas) dist = haversineM(a.coordenadas, b.coordenadas);

        if (dist !== null && dist <= umbral) {
          if (!mismaFuente && telIgual) {
            grupos.push({
              tipo: "mismo_recurso_varias_fuentes",
              ids: [a.id, b.id],
              motivo: "Mismo nombre, teléfono y ubicación en fuentes distintas",
              distancia_max_m: Math.round(dist),
            });
          } else {
            grupos.push({
              tipo: "posible_duplicado",
              ids: [a.id, b.id],
              motivo: mismaFuente
                ? "Mismo nombre y ubicación en la misma fuente"
                : "Mismo nombre y ubicación próxima",
              distancia_max_m: Math.round(dist),
            });
          }
          usados.add(a.id);
          usados.add(b.id);
        } else if (dist !== null && dist > umbral) {
          grupos.push({
            tipo: mismaFuente
              ? "varias_sedes_misma_entidad"
              : "mismo_nombre_distinta_ubicacion",
            ids: [a.id, b.id],
            motivo: "Mismo nombre en ubicaciones distantes (posibles sedes distintas)",
            distancia_max_m: Math.round(dist),
          });
        } else if (dist === null && telIgual && !mismaFuente) {
          grupos.push({
            tipo: "mismo_recurso_varias_fuentes",
            ids: [a.id, b.id],
            motivo: "Mismo nombre y teléfono, sin coordenadas para comparar",
          });
        }
      }
    }
  }

  return grupos;
}
