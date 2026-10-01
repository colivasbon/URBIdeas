/**
 * Módulos de marca de IDEAS Sostenibilidad (INCideas, URBideas, SOCideas).
 * Datos reales de la plataforma: descripciones y enlaces existentes.
 * Los logotipos son activos independientes con transparencia en /logo/.
 */
export type BrandModule = {
  id: string;
  name: string;
  /** Texto alternativo concreto: el nombre de la marca. */
  alt: string;
  /** Ruta del logotipo (símbolo + denominación) con fondo transparente. */
  logo: string;
  /** Dimensiones intrínsecas del activo (para reservar espacio sin CLS). */
  logoWidth: number;
  logoHeight: number;
  /** Descripción existente en la web, sin copy inventado. */
  description: string;
  /** Enlace interno real al módulo. */
  href: string;
  /** Estado existente del módulo, si lo hay. */
  badge?: string;
};

export const BRAND_MODULES: BrandModule[] = [
  {
    id: "incideas",
    name: "INCideas",
    alt: "INCideas",
    logo: "/logo/incideas.png",
    logoWidth: 445,
    logoHeight: 410,
    description:
      "Información municipal para la planificación y gestión de emergencias.",
    href: "/incideas",
  },
  {
    id: "urbideas",
    name: "URBideas",
    alt: "URBideas",
    logo: "/logo/urbideas.png",
    logoWidth: 484,
    logoHeight: 405,
    description: "Análisis territorial, urbanístico y geoespacial.",
    href: "/urbideas",
  },
  {
    id: "socideas",
    name: "SOCideas",
    alt: "SOCideas",
    logo: "/logo/socideas.png",
    logoWidth: 476,
    logoHeight: 396,
    description:
      "Ficha municipal demográfica y económica. Se abre buscando el municipio.",
    href: "/socideas",
    badge: "Beta interna",
  },
];
