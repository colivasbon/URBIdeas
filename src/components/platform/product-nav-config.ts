import type { ProductNavbarConfig } from "./ProductNavbar";

export const CORPORATE_URL =
  process.env.NEXT_PUBLIC_CORPORATE_URL ?? "https://ideasmedioambientales.com";

/** La plataforma se presenta con SOCideas como área principal. */
export function platformNavConfig(): ProductNavbarConfig {
  return socideasNavConfig();
}

export function urbideasNavConfig(): ProductNavbarConfig {
  return {
    product: "urbideas",
    productLabel: "URBideas",
    productMark: "U",
    productHref: "/urbideas",
    productDescription: "Análisis territorial",
    tone: "urban",
    mobileMenuLabel: "Abrir menú de URBideas",
    backLink: { label: "SOCideas", href: "/" },
    navigation: [
      { id: "inicio", label: "Inicio", href: "/urbideas", exact: true },
      {
        id: "explorar",
        label: "Explorar",
        items: [
          { label: "Municipios", href: "/urbideas/municipios", description: "Planeamiento por municipio" },
          { label: "Mapa", href: "/urbideas/mapa", description: "Dictamen territorial de ámbito" },
        ],
      },
      {
        id: "recursos",
        label: "Recursos",
        items: [
          { label: "Legislación", href: "/urbideas/legislacion", description: "Normativa estatal, autonómica y municipal" },
          { label: "API", href: "/urbideas/api-docs", description: "Documentación de consulta programática" },
        ],
      },
    ],
  };
}

export type SocideasContext = {
  /** Código INE de 5 dígitos cuando la ruta es municipal; si no, omitir. */
  codigoINE?: string;
  /** Query preservada (p. ej. "categoria=economia") para no perder contexto. */
  search?: string;
};

const INE_RE = /^\d{5}$/;

export function socideasNavConfig(ctx: SocideasContext = {}): ProductNavbarConfig {
  const ine = ctx.codigoINE && INE_RE.test(ctx.codigoINE) ? ctx.codigoINE : null;
  const qs = ctx.search ? `?${ctx.search.replace(/^\?/, "")}` : "";
  return {
    product: "socideas",
    productLabel: "SOCideas",
    productMark: "S",
    productHref: "/",
    productDescription: "Diagnóstico municipal",
    tone: "social",
    mobileMenuLabel: "Abrir menú de SOCideas",
    navigation: [
      { id: "inicio", label: "Inicio", href: "/", exact: true },
      {
        id: "explorar",
        label: "Explorar",
        items: [
          { label: "Buscador municipal", href: "/#buscador", description: "Buscar por nombre o código INE" },
          ...(ine
            ? [
                {
                  label: "Ficha municipal",
                  href: `/socideas/${ine}${qs}`,
                  description: "Volver a la ficha del municipio actual",
                },
                {
                  label: "Secciones censales",
                  href: `/socideas/${ine}/secciones-censales`,
                  description: "Geometría oficial bajo demanda",
                },
                {
                  label: "Descargas de Demografía",
                  href: `/socideas/${ine}/descargas/demografia`,
                  description: "Tablas de demografía con fuente y periodo",
                },
                {
                  label: "Descargas de Economía",
                  href: `/socideas/${ine}/descargas/economia`,
                  description: "Tablas de economía con fuente y periodo",
                },
              ]
            : []),
        ],
      },
      {
        id: "metodologia",
        label: "Datos y metodología",
        items: [
          { label: "Cómo funciona", href: "/socideas/como-funciona", description: "Metodología y arquitectura" },
          { label: "Fuentes y cobertura", href: "/socideas/como-funciona#fuentes", description: "Fuentes oficiales y cobertura" },
          {
            label: "Actualización y calidad",
            href: "/socideas/como-funciona#actualizacion-calidad",
            description: "Actualización y controles de calidad",
          },
        ],
      },
      {
        id: "urbideas",
        label: "URBideas",
        items: [
          { label: "Presentación", href: "/urbideas", description: "Análisis territorial y urbanístico" },
          { label: "Mapa y dictamen", href: "/urbideas/mapa", description: "Cruce de afecciones sobre un ámbito" },
          { label: "Municipios", href: "/urbideas/municipios", description: "Planeamiento por municipio" },
          { label: "Legislación", href: "/urbideas/legislacion", description: "Normativa estatal, autonómica y municipal" },
          { label: "API", href: "/urbideas/api-docs", description: "Consulta programática" },
        ],
      },
    ],
  };
}

// TODO: RE-HABILITAR ASISTENCIAS — función deshabilitada temporalmente
// export function asistenciasNavConfig(): ProductNavbarConfig {
//   const planned = (label: string) => ({
//     label,
//     badge: "Próximamente" as const,
//     disabled: true,
//   });
//   return {
//     product: "asistencias",
//     productLabel: "Asistencias",
//     productMark: "A",
//     productHref: "/asistencias",
//     productDescription: "Apoyo técnico · IDEAS Sostenibilidad",
//     tone: "assistance",
//     mobileMenuLabel: "Abrir menú de Asistencias",
//     navigation: [
//       { id: "inicio", label: "Inicio", href: "/asistencias", exact: true },
//       {
//         id: "areas",
//         label: "Áreas",
//         items: [
//           planned("Caracterización territorial"),
//           planned("Diagnóstico socioeconómico"),
//           planned("Comunicación y participación"),
//           planned("Responsabilidad social"),
//           planned("Seguimiento de medidas e indicadores"),
//         ],
//       },
//     ],
//   };
// }
