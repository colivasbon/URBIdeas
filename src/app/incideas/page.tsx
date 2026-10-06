import type { Metadata } from "next";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Badge from "@/components/ui/Badge";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import IncideasSearch from "@/components/incideas/IncideasSearch";

export const metadata: Metadata = {
  title: "INCideas",
  description:
    "Información municipal para la planificación y gestión de emergencias. Inventario de riesgos, recursos y vulnerabilidades para Protección Civil.",
};

const BLOQUES = [
  {
    nombre: "Territorio",
    descripcion: "Identificación administrativa, límites, superficie, núcleos, topografía e hidrología.",
    automatizacion: "Alta",
  },
  {
    nombre: "Población",
    descripcion: "Padrón, evolución demográfica, densidad, estructura por edad y población estacional.",
    automatizacion: "Alta",
  },
  {
    nombre: "Necesidades especiales",
    descripcion: "Información agregada sobre movilidad reducida, discapacidades y dependencia.",
    automatizacion: "Baja",
  },
  {
    nombre: "Animales de compañía",
    descripcion: "Estimación de animales, recursos veterinarios y centros de acogida.",
    automatizacion: "Baja",
  },
  {
    nombre: "Infraestructuras",
    descripcion: "Carreteras, ferrocarril, transporte público y accesos estratégicos.",
    automatizacion: "Alta",
  },
  {
    nombre: "Equipamientos",
    descripcion: "Sanidad, educación, servicios sociales, cultura y deporte.",
    automatizacion: "Media",
  },
  {
    nombre: "Servicios básicos",
    descripcion: "Abastecimiento, saneamiento, electricidad, gas y telecomunicaciones.",
    automatizacion: "Baja",
  },
  {
    nombre: "Riesgos",
    descripcion: "Inundación, incendio forestal, sísmico y otros riesgos con cartografía oficial.",
    automatizacion: "Alta",
  },
  {
    nombre: "Medios y recursos",
    descripcion: "CECOPAL, bomberos, policía, vehículos, maquinaria y recursos movilizables.",
    automatizacion: "Baja",
  },
  {
    nombre: "Evacuación",
    descripcion: "Sectores, puntos de encuentro, albergues y capacidad de acogida.",
    automatizacion: "Baja",
  },
];

const ESTADOS = [
  { label: "Datos automáticos", descripcion: "Obtenidos y actualizados desde fuentes estructuradas" },
  { label: "Datos por revisar", descripcion: "Obtenidos automáticamente pero pendientes de validación" },
  { label: "Datos manuales", descripcion: "Incorporados mediante plantillas o importación" },
  { label: "Estimaciones", descripcion: "Con metodología documentada y fuentes indicadas" },
  { label: "Datos restringidos", descripcion: "Internos o de acceso limitado" },
  { label: "Carencias", descripcion: "Información pendiente de obtener" },
];

export default function IncideasHub() {
  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader />

      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[{ label: "IDEAS Sostenibilidad", href: "/" }, { label: "INCideas" }]}
            className="mb-6"
          />
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="type-label text-[var(--moss-ink)]">INCideas</p>
                <Badge variant="muted">Beta interna</Badge>
              </div>
              <h1 className="type-h1 mt-4 max-w-[16ch] text-[var(--text-primary)]">
                Información municipal para la planificación y gestión de emergencias
              </h1>
              <p className="mt-5 max-w-[40ch] text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-secondary)]">
                Sistema híbrido que automatiza la recopilación de datos disponibles y proporciona
                un entorno de carga, revisión y mantenimiento para la información que debe obtenerse
                mediante ayuntamientos, operadores o trabajo de campo.
              </p>
              <p className="mt-8 max-w-[40ch] text-sm text-[var(--text-secondary)]">
                No es un generador automático de planes de emergencia. Es un sistema de información,
                preparación técnica, control de calidad y exportación.
              </p>
            </div>
            <div className="space-y-5">
              <div className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6">
                <h2 className="type-h4 text-[var(--text-primary)]">Buscar un municipio</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Por nombre, por código INE o acotando por comunidad y provincia.
                </p>
                <div className="mt-5">
                  <IncideasSearch />
                </div>
              </div>

              <section aria-labelledby="pai-acceso" className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="pai-acceso" className="type-h4 text-[var(--text-primary)]">Planes de Autoprotección</h2>
                  <Badge variant="success">Nuevo</Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Datos de entorno y riesgo intrínseco para PAI de instalaciones, con cobertura en toda España.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Link href="/incideas/pai/entorno" className="group rounded-[6px] border border-[var(--border-subtle)] p-4 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)]">
                    <p className="font-semibold text-[var(--text-primary)]">Análisis de entorno</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">KMZ o punto en el mapa: distancias, espacios protegidos, masa forestal y medios externos.</p>
                    <p className="mt-3 text-sm font-medium text-[var(--moss-ink)] group-hover:underline">Abrir</p>
                  </Link>
                  <Link href="/incideas/pai/riesgo-intrinseco" className="group rounded-[6px] border border-[var(--border-subtle)] p-4 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)]">
                    <p className="font-semibold text-[var(--text-primary)]">Riesgo intrínseco</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Carga de fuego por sectores según R.D. 164/2025, con tablas para Word y XLSX.</p>
                    <p className="mt-3 text-sm font-medium text-[var(--moss-ink)] group-hover:underline">Abrir</p>
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </section>

        <section aria-labelledby="estados" className="border-t border-[var(--border-subtle)]">
          <div className="container-ima section-ima">
            <h2 id="estados" className="type-h2 text-[var(--text-primary)]">
              Cómo se distingue la procedencia de los datos
            </h2>
            <p className="mt-4 max-w-[60ch] text-[var(--text-secondary)]">
              Cada registro conserva su fuente, fecha y estado de validación. No se mezclan fuentes
              sin procedencia.
            </p>
            <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ESTADOS.map((e) => (
                <div
                  key={e.label}
                  className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
                >
                  <dt className="type-h5 text-[var(--text-primary)]">{e.label}</dt>
                  <dd className="mt-1 text-sm text-[var(--text-secondary)]">{e.descripcion}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="categorias" className="border-t border-[var(--border-subtle)]">
          <div className="container-ima section-ima">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
              <div>
                <h2 id="categorias" className="type-h2 text-[var(--text-primary)]">
                  Categorías del inventario
                </h2>
                <p className="mt-4 max-w-[40ch] text-[var(--text-secondary)]">
                  Catálogo extensible con nivel de automatización, campos obligatorios y caducidad
                  configurables por categoría.
                </p>
                <p className="mt-6">
                  <Link href="/incideas/metodologia" className="link text-sm">
                    Metodología y arquitectura
                  </Link>
                </p>
              </div>
              <dl className="module-index">
                {BLOQUES.map((b) => (
                  <div key={b.nombre} className="module-index__row">
                    <dt>
                      <span className="module-index__name">{b.nombre}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">
                        Automatización: {b.automatizacion}
                      </span>
                    </dt>
                    <dd className="module-index__desc">{b.descripcion}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
