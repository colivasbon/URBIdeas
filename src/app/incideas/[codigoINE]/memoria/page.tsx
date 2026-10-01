import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import {
  SeccionDoc,
  SubseccionDoc,
  Prosa,
  TablaDoc,
  TablaClaveValor,
  Carencia,
  PieFuente,
} from "@/components/incideas/Documento";
import { getMemoriaMunicipal, ind, serie, fmtNumero } from "@/lib/incideas/memoria";
import type { RegistroINCideas } from "@/lib/incideas/types";

export const metadata: Metadata = {
  title: "Memoria municipal - INCideas",
  description: "Memoria de características municipales para la planificación de emergencias.",
};

const INE_RE = /^\d{5}$/;

function coord(r: RegistroINCideas): string {
  return r.coordenadas ? `${r.coordenadas.lat}, ${r.coordenadas.lng}` : "—";
}

function tablaRecursos(regs: RegistroINCideas[], columnasExtra?: string[]) {
  const columnas = ["Nombre", "Dirección", ...(columnasExtra ?? []), "Coordenadas", "Fuente", "Estado"];
  const filas = regs.map((r) => {
    const base: (string | null)[] = [r.nombre_oficial, r.direccion ?? "—"];
    if (columnasExtra) base.push(...columnasExtra.map(() => "—"));
    base.push(coord(r), r.fuente_principal, r.estado_validacion.replace(/_/g, " "));
    return base;
  });
  return { columnas, filas };
}

export default async function IncideasMemoriaPage({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}) {
  const { codigoINE } = await params;
  if (!INE_RE.test(codigoINE)) notFound();

  const m = await getMemoriaMunicipal(codigoINE);
  if (!m) notFound();

  const poblacionTotal = ind(m, "population_total");
  const superficie = ind(m, "area_km2");
  const densidad = ind(m, "density_per_km2");
  const hombres = ind(m, "population_male");
  const mujeres = ind(m, "population_female");
  const evolucion = serie(m, "population_total").slice(-12);
  const edadSexo = m.indicadores.get("population_age_sex")?.serie ?? [];

  const dimKeys = Array.from(
    new Set(edadSexo.flatMap((s) => Object.keys(s.dimensiones ?? {})))
  );

  const sanitarios = [
    ...(m.porSubcategoria["equipamientos/hospital"] ?? []),
    ...(m.porSubcategoria["equipamientos/centro_salud"] ?? []),
    ...(m.porSubcategoria["equipamientos/consultorio"] ?? []),
    ...(m.porSubcategoria["equipamientos/farmacia"] ?? []),
  ];
  const educativos = [
    ...(m.porSubcategoria["equipamientos/colegio"] ?? []),
    ...(m.porSubcategoria["equipamientos/escuela_infantil"] ?? []),
    ...(m.porSubcategoria["equipamientos/instituto"] ?? []),
    ...(m.porSubcategoria["equipamientos/centro_formacion"] ?? []),
  ];
  const culturales = [
    ...(m.porSubcategoria["equipamientos/biblioteca"] ?? []),
    ...(m.porSubcategoria["equipamientos/centro_comunitario"] ?? []),
  ];
  const comerciales = [
    ...(m.porSubcategoria["equipamientos/alimentacion"] ?? []),
    ...(m.porSubcategoria["equipamientos/mercado"] ?? []),
  ];
  const turisticos = [
    ...(m.porSubcategoria["infraestructuras/alojamiento"] ?? []),
    ...(m.porSubcategoria["infraestructuras/camping"] ?? []),
  ];
  const administrativos = [
    ...(m.porSubcategoria["equipamientos/administracion"] ?? []),
    ...(m.porSubcategoria["equipamientos/policia"] ?? []),
    ...(m.porSubcategoria["equipamientos/bomberos"] ?? []),
    ...(m.porSubcategoria["equipamientos/servicios_sociales"] ?? []),
  ];
  const serviciosBasicos = m.porCategoria["servicios_basicos"] ?? [];
  const veterinarias = m.porCategoria["animales"] ?? [];
  const partidas = m.porSubcategoria["territorio/partida"] ?? [];
  const paradas = m.porSubcategoria["infraestructuras/parada_autobus"] ?? [];
  const atributo = (r: RegistroINCideas, k: string): string => {
    const a = r.atributos as Record<string, unknown> | undefined;
    const v = a?.[k];
    return v === null || v === undefined || v === "" ? "—" : String(v);
  };

  const totales = [
    ["Sanitarios y farmacias", sanitarios.length],
    ["Educativos", educativos.length],
    ["Culturales", culturales.length],
    ["Comerciales", comerciales.length],
    ["Turísticos y hosteleros", turisticos.length],
    ["Administrativos y operativos", administrativos.length],
  ] as [string, number][];

  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader codigoINE={codigoINE} />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-16 sm:pt-10">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "Ficha municipal", href: `/incideas/${codigoINE}` },
              { label: "Memoria" },
            ]}
            className="mb-6"
          />

          <header className="border-b-2 border-[var(--musgo-500)] pb-4">
            <p className="type-label text-[var(--moss-ink)]">
              Memoria de características municipales · INCideas
            </p>
            <h1 className="type-h1 mt-2 text-[var(--text-primary)]">{m.municipio.nombre}</h1>
            <p className="mt-2 text-[var(--text-secondary)]">
              Código INE {m.municipio.codigo_ine} · {m.municipio.provincia} ·{" "}
              {m.municipio.comunidad_autonoma}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Base documental para el Plan Territorial Municipal de Emergencias y los planes de
              actuación municipal. Los datos conservan fuente, fecha y estado de validación.
            </p>
            <nav aria-label="Herramientas" className="mt-4 flex flex-wrap gap-2">
              <Link href={`/incideas/${codigoINE}`} className="btn btn-secondary text-sm">
                Ficha e inventario
              </Link>
              <Link href={`/incideas/${codigoINE}/revision`} className="btn btn-secondary text-sm">
                Revisión
              </Link>
              <Link href={`/incideas/${codigoINE}/mapa`} className="btn btn-secondary text-sm">
                Cartografía
              </Link>
              <a
                href={`/api/incideas/exportar?codigo_ine=${codigoINE}&formato=geojson`}
                className="btn btn-ghost text-sm"
              >
                Exportar GeoJSON
              </a>
            </nav>
          </header>

          <SeccionDoc numero="2.1" titulo="Situación geográfica, límites y superficie">
            <TablaClaveValor
              filas={[
                ["Denominación oficial", m.municipio.nombre],
                ["Código INE", m.municipio.codigo_ine],
                ["Provincia", m.municipio.provincia],
                ["Comunidad autónoma", m.municipio.comunidad_autonoma],
                [
                  "Superficie del término municipal",
                  superficie.valor !== null
                    ? `${fmtNumero(superficie.valor)} km²`
                    : "—",
                ],
                [
                  "Coordenadas del casco urbano",
                  m.municipio.lat !== null
                    ? `${m.municipio.lat.toFixed(5)}, ${m.municipio.lng?.toFixed(5)}`
                    : "—",
                ],
                [
                  "Límite municipal",
                  m.boundary ? "Disponible (cartografía OSM)" : "No disponible",
                ],
              ]}
            />
            <PieFuente>
              Fuente: SOCideas (INE) para superficie; límite municipal desde OpenStreetMap (ODbL).
            </PieFuente>
          </SeccionDoc>

          <SeccionDoc numero="2.2" titulo="Características geográficas del municipio">
            <SubseccionDoc numero="2.2.1" titulo="Fisiografía">
              <Carencia>
                Relieve, pendientes y usos del suelo pendientes de incorporar desde cartografía
                oficial (IGN). Estructura preparada.
              </Carencia>
            </SubseccionDoc>
            <SubseccionDoc numero="2.2.2" titulo="Hidrología">
              <Carencia>
                Cauces, barrancos, zonas inundables y dominio público hidráulico pendientes de
                conector oficial (SNCZI / PATRICOVA).
              </Carencia>
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="2.3" titulo="Población y núcleos habitados">
            <TablaClaveValor
              filas={[
                [
                  "Año del padrón",
                  poblacionTotal.anio ? String(poblacionTotal.anio) : "—",
                ],
                [
                  "Población empadronada",
                  poblacionTotal.valor !== null
                    ? `${fmtNumero(poblacionTotal.valor)} habitantes`
                    : "—",
                ],
                ["Hombres", hombres.valor !== null ? fmtNumero(hombres.valor) : "—"],
                ["Mujeres", mujeres.valor !== null ? fmtNumero(mujeres.valor) : "—"],
                [
                  "Densidad de población",
                  densidad.valor !== null ? `${fmtNumero(densidad.valor)} hab/km²` : "—",
                ],
              ]}
            />
            <PieFuente>
              Fuente: SOCideas — {m.indicadores.get("population_total")?.generadoEn?.slice(0, 10) ?? "—"}.
            </PieFuente>

            <SubseccionDoc numero="2.3.1" titulo="Evolución de la población">
              <TablaDoc
                columnas={["Año", "Población"]}
                filas={evolucion.map((s) => [s.anio, fmtNumero(s.valor)])}
                pie="Fuente: SOCideas (INE, padrón continuo)."
              />
            </SubseccionDoc>

            <SubseccionDoc numero="2.3.2" titulo="Estructura por edad y sexo">
              {dimKeys.length > 0 ? (
                <TablaDoc
                  columnas={[...dimKeys, "Población"]}
                  filas={edadSexo
                    .slice(-24)
                    .map((s) => [
                      ...dimKeys.map((k) => s.dimensiones?.[k] ?? "—"),
                      fmtNumero(s.valor),
                    ])}
                  pie="Fuente: SOCideas (INE). Se muestran los últimos registros publicados."
                />
              ) : (
                <Carencia>Estructura por edad no disponible en esta iteración.</Carencia>
              )}
            </SubseccionDoc>

            <SubseccionDoc numero="2.3.3" titulo="Núcleos habitados, distritos y partidas">
              {partidas.length > 0 ? (
                <TablaDoc
                  columnas={["Distrito", "Partida", "Área"]}
                  filas={partidas.map((r) => [
                    atributo(r, "distrito"),
                    r.nombre_oficial,
                    atributo(r, "area"),
                  ])}
                  pie={`Fuente: ${partidas[0].fuente_principal}. Datos municipales pendientes de contraste.`}
                />
              ) : (
                <Carencia>
                  Núcleos, distritos, partidas y diseminados pendientes de la capa municipal.
                </Carencia>
              )}
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="2.4" titulo="Infraestructuras y vías de comunicación">
            <SubseccionDoc numero="2.4.4" titulo="Autobús — paradas">
              {paradas.length > 0 ? (
                <TablaDoc
                  columnas={["Parada", "Dirección", "Líneas", "Coordenadas", "Fuente"]}
                  filas={paradas.map((r) => [
                    r.nombre_oficial,
                    r.direccion ?? "—",
                    atributo(r, "lineas"),
                    coord(r),
                    r.fuente_principal,
                  ])}
                  pie="Fuente: plantilla municipal (coordenadas UTM 30N reproyectadas a WGS84)."
                />
              ) : (
                <Carencia>Paradas de autobús pendientes de la capa municipal.</Carencia>
              )}
            </SubseccionDoc>
            <SubseccionDoc numero="2.4.1" titulo="Carreteras y caminos">
              <Carencia>
                Red viaria y caminos pendientes de fuente oficial (IGN) o municipal.
              </Carencia>
            </SubseccionDoc>
            <SubseccionDoc numero="2.4.3" titulo="Ferrocarril">
              <Carencia>Ferrocarril y estaciones pendientes de fuente oficial.</Carencia>
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="2.6" titulo="Servicios básicos">
            <SubseccionDoc numero="2.6.12" titulo="Estaciones de combustible">
              <TablaDoc
                {...tablaRecursos(serviciosBasicos)}
                pie="Fuente: OpenStreetMap (ODbL), pendiente de revisión."
              />
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="2.7" titulo="Equipamientos con afluencia de público">
            <TablaClaveValor
              filas={totales.map(([k, v]) => [k, String(v)])}
            />
            <SubseccionDoc numero="2.7.3" titulo="Centros sanitarios y farmacias">
              <TablaDoc
                {...tablaRecursos(sanitarios)}
                pie="Fuente: OpenStreetMap (ODbL). No fiable para camas ni servicios; requiere contraste oficial."
              />
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.1" titulo="Centros educativos">
              <TablaDoc
                columnas={["Centro", "Tipo", "Titularidad", "Dirección", "Personal", "Alumnos", "Coordenadas"]}
                filas={educativos.map((r) => [
                  r.nombre_oficial,
                  (r.subcategoria ?? "—").replace(/_/g, " "),
                  r.titularidad ?? "—",
                  r.direccion ?? "—",
                  r.personal_publicado !== null && r.personal_publicado !== undefined
                    ? String(r.personal_publicado)
                    : "—",
                  r.capacidad !== null && r.capacidad !== undefined ? String(r.capacidad) : "—",
                  coord(r),
                ])}
                pie="Fuente: plantilla municipal y OpenStreetMap (ODbL). Personal y alumnado solo cuando la fuente municipal lo aporta."
              />
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.5" titulo="Equipamientos culturales">
              <TablaDoc {...tablaRecursos(culturales)} />
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.6" titulo="Equipamientos comerciales y de ocio">
              <TablaDoc {...tablaRecursos(comerciales)} />
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.7" titulo="Equipamientos turísticos y hosteleros">
              <TablaDoc
                {...tablaRecursos(turisticos)}
                pie="Fuente: OpenStreetMap (ODbL). Capacidad y plazas pendientes de la fuente autonómica de turismo."
              />
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="2.8" titulo="Centros administrativos y operativos">
            <TablaDoc {...tablaRecursos(administrativos)} />
          </SeccionDoc>

          <SeccionDoc numero="Anexo" titulo="Recursos de atención animal">
            <TablaDoc
              {...tablaRecursos(veterinarias)}
              pie="Fuente: OpenStreetMap (ODbL). Recursos veterinarios y de acogida."
            />
          </SeccionDoc>

          <SeccionDoc numero="Carencias" titulo="Información pendiente de obtención">
            <Prosa>
              Las siguientes secciones requieren información municipal, de operadores o de
              fuentes oficiales todavía no verificadas. INCideas conserva su estructura y
              plantillas, pero no las rellena con datos inventados.
            </Prosa>
            <TablaDoc
              columnas={["Bloque", "Motivo", "Vía de obtención"]}
              filas={[
                ["2.2 Fisiografía e hidrología", "Sin conector oficial verificado", "IGN / SNCZI / PATRICOVA"],
                ["2.3.3 Núcleos y distritos", "Dato municipal", "Plantilla municipal (Excel)"],
                ["2.4 Infraestructuras y vías", "Sin conector oficial verificado", "IGN / operadores"],
                ["2.6 Redes de agua, energía y residuos", "Dato de operadores", "Plantilla de operador"],
                ["2.9 Riesgos", "Cartografía oficial pendiente", "PATRICOVA / SNCZI / Generalitat"],
                ["Anexo II Medios y recursos", "Dato municipal e interno", "Plantilla + capa restringida"],
              ]}
              pie="Cada bloque se completará cuando exista fuente verificada o información municipal."
            />
          </SeccionDoc>

          <p className="mt-12 border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-muted)]">
            Memoria generada por INCideas a partir de {m.totalRegistros} registros trazables.
            Ningún dato se presenta sin fuente, fecha y estado. Los datos restringidos no se
            incluyen.
          </p>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
