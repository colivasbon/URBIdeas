// Envoltorio cliente de `EstructuraPoblacionBlock` con estado propio.
//
// Existe para poder publicar la pirámide 2025 en municipios SIN serie
// demográfica (Ceuta, Melilla…) donde la ficha no monta `FichaFiltros` —
// que es quien normalmente gestiona `est_ref` / `est_modo`. Sin este
// envoltorio el bloque era inalcanzable y la pirámide no se veía en 2 de los
// 9 pilotos, a pesar de que el objeto R2 sí existía y validaba.
//
// Cliente (necesita estado para los dos selectores); sin dependencias nuevas.

"use client";

import { useState } from "react";
import EstructuraPoblacionBlock from "./EstructuraPoblacionBlock";
import type { MunicipalStructureWithBenchmarks } from "@/lib/socideas-population-runtime";
import {
  isEstructuraModo,
  isEstructuraRefKey,
  type EstructuraModo,
  type EstructuraRefKey,
} from "@/lib/socideas-population-presentation";

export default function EstructuraSoloBloque({
  data,
  municipioNombre,
  provinciaNombre,
  ccaaNombre,
  estRef,
  estModo,
}: {
  data: MunicipalStructureWithBenchmarks;
  municipioNombre: string;
  provinciaNombre?: string | null;
  ccaaNombre?: string | null;
  estRef?: string;
  estModo?: string;
}) {
  const [ref, setRef] = useState<EstructuraRefKey>(() =>
    isEstructuraRefKey(estRef) ? estRef : "espana",
  );
  const [modo, setModo] = useState<EstructuraModo>(() =>
    isEstructuraModo(estModo) ? estModo : "perfil",
  );

  return (
    <EstructuraPoblacionBlock
      data={data}
      municipioNombre={municipioNombre}
      provinciaNombre={provinciaNombre ?? null}
      ccaaNombre={ccaaNombre ?? null}
      refKey={ref}
      modo={modo}
      onRefChange={setRef}
      onModoChange={setModo}
    />
  );
}
