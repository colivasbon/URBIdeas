"use client";

// Extensión que carga y agrega datos educativos al atlas de secciones.
// Funciona de forma transparente: si hay datos educativos disponibles,
// los integra en el catálogo de indicadores.

import { useEffect, useCallback } from "react";
import type { SeccionesAtlasV1 } from "@/lib/socideas-secciones";
import { leerDatosEducativosLocalDev } from "@/lib/socideas-test-data-local";
import type { EducationMunicipalDataset } from "@/lib/socideas-secciones-education";

interface Props {
  codigoINE: string;
  atlas: SeccionesAtlasV1 | null;
  onAtlasExtended?: (atlasExtended: SeccionesAtlasV1) => void;
}

export default function SeccionesEducationExtension({ codigoINE, atlas, onAtlasExtended }: Props) {
  const extenderAtlas = useCallback(async () => {
    if (!atlas) return;

    // Intentar cargar datos educativos
    const datosEducativos = await leerDatosEducativosLocalDev(codigoINE, 2024);
    if (!datosEducativos) return;

    // Crear una copia extendida del atlas
    const atlasExtendido: SeccionesAtlasV1 = {
      ...atlas,
      indicators: [...atlas.indicators, ...datosEducativos.indicators],
      observations: {
        ...atlas.observations,
      },
    };

    // Agregar observaciones educativas
    for (const valor of datosEducativos.values) {
      const seccionClave = valor.sectionCode;
      if (!atlasExtendido.observations[seccionClave]) {
        atlasExtendido.observations[seccionClave] = {};
      }
      if (!atlasExtendido.observations[seccionClave]![valor.indicatorId]) {
        atlasExtendido.observations[seccionClave]![valor.indicatorId] = {};
      }

      const indicador = datosEducativos.indicators.find((ind) => ind.id === valor.indicatorId);
      atlasExtendido.observations[seccionClave]![valor.indicatorId]![String(datosEducativos.period)] = {
        sectionKey: seccionClave,
        municipalityIne: atlas.municipalityIne,
        geometryYear: atlas.geometryYear,
        referencePeriod: datosEducativos.period,
        operation: datosEducativos.source.operation,
        sourceTable: datosEducativos.source.table,
        indicatorId: valor.indicatorId,
        dimensions: { ambito: "seccion_censal" },
        value: valor.value,
        unit: indicador?.unidad || "%",
        denominator: valor.denominator?.toString() || null,
        status: valor.status,
        sourceUrl: datosEducativos.source.url,
        publishedAt: datosEducativos.source.retrievedAt,
        retrievedAt: datosEducativos.generatedAt,
        checksum: "",
        methodologyNote: valor.note || null,
      };
    }

    // Agregar cobertura
    for (const indicador of datosEducativos.indicators) {
      atlasExtendido.cobertura.push({
        indicatorId: indicador.id,
        periodos: [datosEducativos.period],
        periodoPorDefecto: datosEducativos.period,
        seccionesConDato: datosEducativos.validation.valuesObserved,
        seccionesSinDifundir: datosEducativos.validation.valuesUndisclosed,
        seccionesSinCobertura: 0,
      });
    }

    if (onAtlasExtended) {
      onAtlasExtended(atlasExtendido);
    }
  }, [codigoINE, atlas, onAtlasExtended]);

  useEffect(() => {
    extenderAtlas();
  }, [extenderAtlas]);

  return null;
}
