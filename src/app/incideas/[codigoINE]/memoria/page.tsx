import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import {
  anclaSeccion,
  SeccionDoc,
  SubseccionDoc,
  Prosa,
  TablaDoc,
  TablaClaveValor,
  Carencia,
  PieFuente,
} from "@/components/incideas/Documento";
import {
  getMemoriaMunicipal,
  ind,
  serie,
  fmtNumero,
  pieFuentes,
  seleccionarPorFuente,
  type SeleccionFuentes,
} from "@/lib/incideas/memoria";
import type { RegistroINCideas } from "@/lib/incideas/types";

export const metadata: Metadata = {
  title: "Memoria municipal - INCideas",
  description: "Memoria de características municipales para la planificación de emergencias.",
};

const INE_RE = /^\d{5}$/;

/** Índice: numeración de la memoria del PTM (estructura de referencia). */
const INDICE: [string, string][] = [
  ["2.1", "Situación geográfica, límites y superficie"],
  ["2.2", "Características geográficas"],
  ["2.3", "Población y núcleos habitados"],
  ["2.4", "Infraestructuras y vías de comunicación"],
  ["2.5", "Zonas y polígonos industriales"],
  ["2.6", "Servicios básicos"],
  ["2.7", "Equipamientos con afluencia de público"],
  ["2.8", "Centros administrativos y operativos"],
  ["5.9", "Plan de evacuación (datos de base)"],
  ["Anexo II", "Medios y recursos"],
  ["Anexo animal", "Recursos de atención animal"],
  ["Carencias", "Información pendiente"],
];

function coord(r: RegistroINCideas): string {
  return r.coordenadas ? `${r.coordenadas.lat}, ${r.coordenadas.lng}` : "—";
}

function atributo(r: RegistroINCideas, k: string): string {
  const v = (r.atributos as Record<string, unknown> | undefined)?.[k];
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

const tipo = (r: RegistroINCideas) => (r.subcategoria ?? "—").replace(/_/g, " ");

interface ColumnaExtra {
  titulo: string;
  valor: (r: RegistroINCideas) => string;
}

function tablaRecursos(regs: RegistroINCideas[], extras: ColumnaExtra[] = []) {
  return {
    columnas: ["Nombre", "Dirección", ...extras.map((e) => e.titulo), "Coordenadas", "Fuente", "Estado"],
    filas: regs.map((r) => [
      r.nombre_oficial,
      r.direccion ?? "—",
      ...extras.map((e) => e.valor(r)),
      coord(r),
      r.fuente_principal,
      r.estado_validacion.replace(/_/g, " "),
    ]),
  };
}

/** Tabla de recursos con pie de fuente calculado, o bloque de carencia si no hay datos. */
function BloqueRecursos({
  sel,
  extras,
  nota,
  carencia,
}: {
  sel: SeleccionFuentes;
  extras?: ColumnaExtra[];
  nota?: string;
  carencia: string;
}) {
  if (sel.usados.length === 0) return <Carencia>{carencia}</Carencia>;
  return <TablaDoc {...tablaRecursos(sel.usados, extras)} pie={pieFuentes(sel, nota)} />;
}

const COL_TIPO: ColumnaExtra = { titulo: "Tipo", valor: tipo };

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
  const dimKeys = Array.from(new Set(edadSexo.flatMap((s) => Object.keys(s.dimensiones ?? {}))));

  const sel = (...claves: string[]) => seleccionarPorFuente(m, claves);

  const partidas = sel("territorio/partida");
  const ferrocarril = sel("infraestructuras/estacion_ferrocarril", "infraestructuras/parada_tranvia");
  const estacionesBus = sel("infraestructuras/estacion_autobus");
  const paradasBus = sel("infraestructuras/parada_autobus");
  const taxis = sel("infraestructuras/parada_taxi");
  const puertos = sel("infraestructuras/puerto");
  const helipuertos = sel("infraestructuras/helipuerto");
  const hidrantes = sel("servicios_basicos/hidrante", "servicios_basicos/punto_agua_incendios");
  const combustible = sel("servicios_basicos/estacion_servicio");
  const educativos = sel(
    "equipamientos/colegio",
    "equipamientos/instituto",
    "equipamientos/escuela_infantil",
    "equipamientos/educacion_especial",
    "equipamientos/centro_formacion"
  );
  const sanitarios = sel(
    "equipamientos/hospital",
    "equipamientos/centro_salud",
    "equipamientos/centro_especialidades",
    "equipamientos/consultorio",
    "equipamientos/farmacia"
  );
  const sociosanitarios = sel("equipamientos/servicios_sociales");
  const culturales = sel("equipamientos/biblioteca", "equipamientos/centro_comunitario");
  const comerciales = sel("equipamientos/alimentacion", "equipamientos/mercado");
  const turisticos = sel("infraestructuras/alojamiento", "infraestructuras/camping");
  const administracion = sel("equipamientos/administracion");
  const seguridad = sel("equipamientos/policia");
  const intervencion = sel(
    "equipamientos/bomberos",
    "medios_recursos/base_ambulancias",
    "medios_recursos/puesto_socorrismo"
  );
  const puntosEncuentro = sel("evacuacion/punto_encuentro");
  const desfibriladores = sel("medios_recursos/desfibrilador");
  const veterinarias = sel("animales/clinica_veterinaria");

  // Personal y alumnado: solo los aporta la plantilla municipal. Si la fuente usada es otra,
  // se toman de la plantilla cuando el nombre normalizado coincide.
  const municipalPorNombre = new Map<string, RegistroINCideas>();
  for (const r of educativos.alternativos) {
    if (r.personal_publicado != null || r.capacidad != null) {
      municipalPorNombre.set(r.nombre_normalizado, r);
    }
  }
  const dato = (r: RegistroINCideas, campo: "personal_publicado" | "capacidad"): string => {
    const v = r[campo] ?? municipalPorNombre.get(r.nombre_normalizado)?.[campo];
    return v === null || v === undefined ? "—" : String(v);
  };
  const conPlantilla = educativos.usados.some(
    (r) => dato(r, "personal_publicado") !== "—" || dato(r, "capacidad") !== "—"
  );

  const totales: [string, number][] = [
    ["Educativos", educativos.usados.length],
    ["Sanitarios y farmacias", sanitarios.usados.length],
    ["Sociosanitarios y asistenciales", sociosanitarios.usados.length],
    ["Culturales", culturales.usados.length],
    ["Comerciales", comerciales.usados.length],
    ["Turísticos y hosteleros", turisticos.usados.length],
  ];

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
              actuación municipal. Cada bloque usa la fuente de mayor rango disponible (oficial,
              después municipal, después colaborativa); las demás quedan para contraste.
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
                href={`/api/incideas/exportar?codigo_ine=${codigoINE}&formato=xlsx`}
                className="btn btn-ghost text-sm"
              >
                Exportar XLSX
              </a>
              <a
                href={`/api/incideas/exportar?codigo_ine=${codigoINE}&formato=geojson`}
                className="btn btn-ghost text-sm"
              >
                Exportar GeoJSON
              </a>
            </nav>
          </header>

          <nav
            aria-label="Índice de la memoria"
            className="mt-6 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
          >
            <p className="type-label text-[var(--text-muted)]">Índice</p>
            <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {INDICE.map(([n, t]) => (
                <li key={n}>
                  <a href={`#${anclaSeccion(n)}`} className="link">
                    <span className="tnum">{n}</span> {t}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <SeccionDoc numero="2.1" titulo="Situación geográfica, límites y superficie">
            <TablaClaveValor
              filas={[
                ["Denominación oficial", m.municipio.nombre],
                ["Código INE", m.municipio.codigo_ine],
                ["Provincia", m.municipio.provincia],
                ["Comunidad autónoma", m.municipio.comunidad_autonoma],
                [
                  "Superficie del término municipal",
                  superficie.valor !== null ? `${fmtNumero(superficie.valor)} km²` : "—",
                ],
                [
                  "Coordenadas del casco urbano",
                  m.municipio.lat !== null
                    ? `${m.municipio.lat.toFixed(5)}, ${m.municipio.lng?.toFixed(5)}`
                    : "—",
                ],
                ["Límite municipal", m.boundary ? "Disponible (cartografía OSM)" : "No disponible"],
              ]}
            />
            <PieFuente>
              Fuente: SOCideas (INE) para superficie; límite municipal desde OpenStreetMap (ODbL).
            </PieFuente>
          </SeccionDoc>

          <SeccionDoc numero="2.2" titulo="Principales características geográficas">
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
                ["Año del padrón", poblacionTotal.anio ? String(poblacionTotal.anio) : "—"],
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
              Fuente: SOCideas —{" "}
              {m.indicadores.get("population_total")?.generadoEn?.slice(0, 10) ?? "—"}.
            </PieFuente>

            <h3 className="type-h5 mt-6 text-[var(--text-primary)]">Evolución de la población</h3>
            <TablaDoc
              columnas={["Año", "Población"]}
              filas={evolucion.map((s) => [s.anio, fmtNumero(s.valor)])}
              pie="Fuente: SOCideas (INE, padrón continuo)."
            />

            <h3 className="type-h5 mt-6 text-[var(--text-primary)]">Estructura por edad y sexo</h3>
            {dimKeys.length > 0 ? (
              <TablaDoc
                columnas={[...dimKeys, "Población"]}
                filas={edadSexo
                  .slice(-24)
                  .map((s) => [...dimKeys.map((k) => s.dimensiones?.[k] ?? "—"), fmtNumero(s.valor)])}
                pie="Fuente: SOCideas (INE). Se muestran los últimos registros publicados."
              />
            ) : (
              <Carencia>Estructura por edad no disponible en esta iteración.</Carencia>
            )}

            <SubseccionDoc numero="2.3.1" titulo="Núcleos habitados, distritos y partidas">
              {partidas.usados.length > 0 ? (
                <TablaDoc
                  columnas={["Distrito", "Partida", "Área"]}
                  filas={partidas.usados.map((r) => [
                    atributo(r, "distrito"),
                    r.nombre_oficial,
                    atributo(r, "area"),
                  ])}
                  pie={pieFuentes(partidas, "Datos municipales pendientes de contraste.")}
                />
              ) : (
                <Carencia>
                  Núcleos, distritos, partidas y diseminados pendientes de la capa municipal.
                </Carencia>
              )}
            </SubseccionDoc>
            <SubseccionDoc
              numero="2.3.2"
              titulo="Población con necesidades especiales: discapacidad o vulnerabilidad"
            >
              <Carencia>
                Requiere información agregada de servicios sociales municipales (por distrito o
                sector). INCideas no almacena datos de personas identificables.
              </Carencia>
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="2.4" titulo="Infraestructuras y vías de comunicación">
            <SubseccionDoc numero="2.4.1" titulo="Carreteras">
              <Carencia>Red viaria pendiente de fuente oficial (IGN / titulares de vía).</Carencia>
            </SubseccionDoc>
            <SubseccionDoc numero="2.4.2" titulo="Caminos principales">
              <Carencia>Caminos pendientes de cartografía oficial o municipal.</Carencia>
            </SubseccionDoc>
            <SubseccionDoc numero="2.4.3" titulo="Ferrocarril">
              <BloqueRecursos
                sel={ferrocarril}
                extras={[COL_TIPO, { titulo: "Red", valor: (r) => atributo(r, "network") }]}
                carencia="Sin estaciones de ferrocarril ni de tranvía identificadas."
              />
            </SubseccionDoc>
            <SubseccionDoc numero="2.4.4" titulo="Autobús">
              {estacionesBus.usados.length > 0 && (
                <TablaDoc
                  {...tablaRecursos(estacionesBus.usados)}
                  pie={pieFuentes(estacionesBus)}
                />
              )}
              {paradasBus.usados.length > 0 ? (
                <TablaDoc
                  columnas={["Parada", "Dirección", "Líneas", "Coordenadas", "Fuente"]}
                  filas={paradasBus.usados.map((r) => [
                    r.nombre_oficial,
                    r.direccion ?? "—",
                    atributo(r, "lineas") !== "—" ? atributo(r, "lineas") : atributo(r, "route_ref"),
                    coord(r),
                    r.fuente_principal,
                  ])}
                  pie={pieFuentes(paradasBus)}
                />
              ) : (
                <Carencia>Paradas de autobús pendientes de la capa municipal u operador.</Carencia>
              )}
              {taxis.usados.length > 0 && (
                <TablaDoc {...tablaRecursos(taxis.usados)} pie={pieFuentes(taxis, "Paradas de taxi.")} />
              )}
            </SubseccionDoc>
            <SubseccionDoc numero="2.4.5" titulo="Puertos">
              <BloqueRecursos sel={puertos} carencia="Sin instalaciones portuarias identificadas." />
            </SubseccionDoc>
            <SubseccionDoc numero="2.4.6" titulo="Aeropuertos y helisuperficies">
              <BloqueRecursos
                sel={helipuertos}
                nota="Uso y operatividad a confirmar con el titular; OSM no acredita autorización."
                carencia="Sin helisuperficies identificadas."
              />
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="2.5" titulo="Zonas y polígonos industriales">
            <Carencia>Pendiente de catastro, planeamiento (URBideas) o capa municipal.</Carencia>
          </SeccionDoc>

          <SeccionDoc numero="2.6" titulo="Servicios básicos">
            <Carencia>
              2.6.1–2.6.4 y 2.6.6–2.6.11 y 2.6.13 (agua, saneamiento, depuración, residuos, energía,
              gas y telecomunicaciones): dato de operadores, pendiente de plantilla.
            </Carencia>
            <SubseccionDoc numero="2.6.5" titulo="Hidrantes">
              <BloqueRecursos
                sel={hidrantes}
                extras={[COL_TIPO]}
                nota="La red de hidrantes debe obtenerse del servicio municipal de aguas."
                carencia="No hay hidrantes cartografiados en las fuentes abiertas. Requiere la capa del servicio municipal de aguas."
              />
            </SubseccionDoc>
            <SubseccionDoc numero="2.6.12" titulo="Estaciones de combustible y electrolineras">
              <BloqueRecursos
                sel={combustible}
                extras={[{ titulo: "Horario", valor: (r) => r.horario ?? "—" }]}
                nota="Electrolineras pendientes de fuente."
                carencia="Sin estaciones de servicio identificadas."
              />
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="2.7" titulo="Equipamientos con afluencia de público">
            <TablaClaveValor filas={totales.map(([k, v]) => [k, String(v)])} />
            <SubseccionDoc numero="2.7.1" titulo="Centros educativos">
              {educativos.usados.length > 0 ? (
                <TablaDoc
                  columnas={[
                    "Centro",
                    "Tipo",
                    "Titularidad",
                    "Dirección",
                    ...(conPlantilla ? ["Personal", "Alumnos"] : []),
                    "Coordenadas",
                  ]}
                  filas={educativos.usados.map((r) => [
                    r.nombre_oficial,
                    atributo(r, "tipo") !== "—" ? atributo(r, "tipo") : tipo(r),
                    r.titularidad ?? "—",
                    r.direccion ?? "—",
                    ...(conPlantilla ? [dato(r, "personal_publicado"), dato(r, "capacidad")] : []),
                    coord(r),
                  ])}
                  pie={pieFuentes(
                    educativos,
                    conPlantilla
                      ? "Personal y alumnado de la plantilla municipal cuando el nombre coincide."
                      : undefined
                  )}
                />
              ) : (
                <Carencia>Sin centros educativos identificados.</Carencia>
              )}
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.2" titulo="Equipamientos deportivos">
              <Carencia>Pendiente de inventario municipal o del censo de instalaciones deportivas.</Carencia>
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.3" titulo="Centros sanitarios y farmacias">
              <BloqueRecursos
                sel={sanitarios}
                extras={[COL_TIPO, { titulo: "Zona básica", valor: (r) => atributo(r, "zona_basica") }]}
                nota="Sin camas ni cartera de servicios: requieren contraste con el departamento de salud."
                carencia="Sin centros sanitarios identificados."
              />
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.4" titulo="Centros sociosanitarios y asistenciales">
              <BloqueRecursos
                sel={sociosanitarios}
                carencia="Pendiente del registro autonómico de servicios sociales."
              />
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.5" titulo="Equipamientos culturales">
              <BloqueRecursos sel={culturales} carencia="Sin equipamientos culturales identificados." />
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.6" titulo="Equipamientos comerciales y de ocio">
              <BloqueRecursos sel={comerciales} carencia="Sin equipamientos comerciales identificados." />
            </SubseccionDoc>
            <SubseccionDoc numero="2.7.7" titulo="Equipamientos turísticos y hosteleros">
              <BloqueRecursos
                sel={turisticos}
                nota="Capacidad y plazas pendientes del registro autonómico de turismo."
                carencia="Sin alojamientos identificados."
              />
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="2.8" titulo="Centros administrativos y operativos">
            <SubseccionDoc numero="2.8.1" titulo="Ayuntamiento y otros edificios de la administración">
              <BloqueRecursos sel={administracion} carencia="Sin edificios administrativos identificados." />
            </SubseccionDoc>
            <SubseccionDoc numero="2.8.3" titulo="Centros de las fuerzas y cuerpos de seguridad">
              <BloqueRecursos sel={seguridad} carencia="Sin centros de seguridad identificados." />
            </SubseccionDoc>
            <SubseccionDoc numero="2.8.4" titulo="Centros de los servicios de intervención">
              <BloqueRecursos
                sel={intervencion}
                extras={[COL_TIPO]}
                carencia="Sin parques de bomberos, bases de ambulancias ni puestos de socorrismo identificados."
              />
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="5.9" titulo="Plan de evacuación: datos de base">
            <SubseccionDoc numero="5.9.3" titulo="Puntos de encuentro y vías de evacuación">
              <BloqueRecursos
                sel={puntosEncuentro}
                nota="Puntos señalizados en OSM; no sustituyen a los definidos por el plan."
                carencia="Sin puntos de encuentro identificados. Deben definirlos el plan y el ayuntamiento."
              />
            </SubseccionDoc>
            <SubseccionDoc numero="5.9.4" titulo="Medios de transporte y zonas de aterrizaje">
              <Prosa>
                Véanse 2.4.3 (ferrocarril y tranvía), 2.4.4 (autobús y taxi) y 2.4.6
                (helisuperficies).
              </Prosa>
            </SubseccionDoc>
          </SeccionDoc>

          <SeccionDoc numero="Anexo II" titulo="Directorio y catálogo de medios y recursos">
            <SubseccionDoc numero="II.1" titulo="Desfibriladores (DEA)">
              <BloqueRecursos
                sel={desfibriladores}
                extras={[{ titulo: "Acceso", valor: (r) => atributo(r, "access") }]}
                nota="Cobertura OSM muy incompleta; el registro autonómico de DEA prevalece."
                carencia="Sin desfibriladores identificados."
              />
            </SubseccionDoc>
            <Carencia>
              Vehículos, maquinaria, personal y contactos operativos: dato municipal e interno,
              de visibilidad restringida.
            </Carencia>
          </SeccionDoc>

          <SeccionDoc numero="Anexo animal" titulo="Recursos de atención animal">
            <BloqueRecursos sel={veterinarias} carencia="Sin recursos veterinarios identificados." />
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
                ["2.3.2 Necesidades especiales", "Dato agregado municipal", "Servicios sociales municipales"],
                ["2.4.1–2.4.2 Carreteras y caminos", "Geometría lineal no incorporada", "IGN / titulares de vía"],
                ["2.5 Polígonos industriales", "Sin fuente incorporada", "Catastro / planeamiento"],
                ["2.6 Redes de agua, energía y residuos", "Dato de operadores", "Plantilla de operador"],
                ["2.6.5 Hidrantes", "Sin cobertura en fuentes abiertas", "Servicio municipal de aguas"],
                ["3 Riesgos", "Cartografía oficial pendiente", "PATRICOVA / SNCZI / Generalitat"],
                ["Anexo II Medios y recursos", "Dato municipal e interno", "Plantilla + capa restringida"],
              ]}
              pie="Cada bloque se completará cuando exista fuente verificada o información municipal."
            />
          </SeccionDoc>

          <p className="mt-12 border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-muted)]">
            Memoria generada por INCideas a partir de {m.totalRegistros} registros trazables.
            Ningún dato se presenta sin fuente, fecha y estado. Los datos restringidos no se
            incluyen
            {m.posiblesBajas > 0
              ? `, ni ${m.posiblesBajas} posibles bajas pendientes de revisión`
              : ""}
            .
          </p>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
