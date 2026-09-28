import type { Metadata } from "next";
import Link from "next/link";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import MapSheet from "@/components/platform/MapSheet";
import { Button } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import PageShell from "@/components/ui/PageShell";
import KpiNumber from "@/components/ui/KpiNumber";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const INDICE = [
  { id: "paleta", label: "Paleta" },
  { id: "tokens", label: "Tokens semánticos" },
  { id: "tipografia", label: "Tipografía" },
  { id: "botones", label: "Botones" },
  { id: "badges", label: "Badges" },
  { id: "formularios", label: "Formularios" },
  { id: "tablas", label: "Tablas" },
  { id: "notas", label: "Notas y estados" },
  { id: "estructura", label: "Estructura de página" },
  { id: "contrastes", label: "Contrastes" },
];

// Paleta corporativa: el rol manda sobre el color.
const PALETA: { nombre: string; varName: string; hex: string; rol: string; texto: string; fg: string }[] = [
  { nombre: "Musgo", varName: "--musgo", hex: "#3E665C", rol: "Institucional: filetes fuertes, enlaces, marca.", texto: "Hueso", fg: "var(--hueso)" },
  { nombre: "Conífera", varName: "--conifera", hex: "#86B73D", rol: "Acento: solo relleno de la acción principal e indicadores activos.", texto: "Carbón", fg: "var(--carbon-900)" },
  { nombre: "Retama", varName: "--retama", hex: "#FBE122", rol: "Solo sobre fondos oscuros. Nunca sobre claros.", texto: "Carbón", fg: "var(--carbon-900)" },
  { nombre: "Carbón", varName: "--carbon", hex: "#3C403E", rol: "Texto sobre claros; fondo oscuro alternativo.", texto: "Hueso", fg: "var(--hueso)" },
  { nombre: "Hueso", varName: "--hueso", hex: "#F1F1F1", rol: "Fondo base de página (tema claro).", texto: "Carbón", fg: "var(--carbon)" },
  { nombre: "Rupestre", varName: "--rupestre", hex: "#643335", rol: "Alerta y acciones destructivas.", texto: "Hueso", fg: "var(--hueso)" },
  { nombre: "Limo", varName: "--limo", hex: "#B0BDB0", rol: "Apoyo: bordes y divisores.", texto: "Carbón", fg: "var(--carbon)" },
  { nombre: "Crisopa", varName: "--crisopa", hex: "#C2E189", rol: "Apoyo claro: badges de disponible.", texto: "Carbón", fg: "var(--carbon)" },
];

const SEMANTICOS: [string, string][] = [
  ["--bg-canvas", "Fondo de página"],
  ["--bg-surface", "Superficie elevada (tablas, campos)"],
  ["--bg-surface-sunken", "Bandas de sección y cabeceras de tabla"],
  ["--text-primary", "Texto principal"],
  ["--text-secondary", "Texto de apoyo y entradillas"],
  ["--text-muted", "Metadatos y rótulos"],
  ["--text-link", "Enlaces"],
  ["--moss-ink", "Rótulos de módulo y numerales"],
  ["--border-subtle", "Divisores entre filas"],
  ["--border-default", "Bordes de campo"],
  ["--border-strong", "Filete que abre o cierra un bloque"],
  ["--border-focus", "Anillo de foco"],
  ["--action-primary-bg", "Relleno de la acción principal"],
];

const TIPOS: { cls: string; muestra: string; uso: string }[] = [
  { cls: "type-display", muestra: "Qué se puede hacer en un suelo", uso: "Solo portadas (MapSheet)" },
  { cls: "type-h1", muestra: "Cómo funciona SOCideas", uso: "Título de página (PageShell)" },
  { cls: "type-h2", muestra: "Fuentes oficiales y cobertura", uso: "Sección" },
  { cls: "type-h3", muestra: "Renta de los hogares", uso: "Subsección" },
  { cls: "type-h4", muestra: "Población por edad y sexo", uso: "Bloque, fila de índice" },
  { cls: "type-body", muestra: "Texto corrido de lectura, con medida máxima de unos 68 caracteres.", uso: "Prosa" },
  { cls: "type-body-sm", muestra: "Notas al pie de dato y descripciones de fila.", uso: "Apoyo" },
  { cls: "type-label", muestra: "Etiqueta de campo o rótulo", uso: "Rótulos, en minúscula de frase" },
];

const CONTRASTES = [
  ["Hueso sobre musgo", "5,70:1", "Cumple"],
  ["Musgo sobre hueso", "5,70:1", "Cumple"],
  ["Retama sobre musgo", "4,88:1", "Cumple"],
  ["Carbón-900 sobre conífera (acción principal)", "6,79:1", "Cumple"],
  ["Carbón-900 sobre conífera-600 (hover)", "4,64:1", "Cumple"],
  ["Hueso sobre rupestre", "9,00:1", "Cumple"],
  ["Musgo-700 sobre musgo-50 (badge)", "9,60:1", "Cumple"],
  ["Carbón sobre crisopa (badge)", "7,23:1", "Cumple"],
];

function Seccion({ id, title, lede, children }: { id: string; title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`h-${id}`} className="scroll-mt-24 border-t border-[var(--border-subtle)] py-12">
      <h2 id={`h-${id}`} className="type-h2 text-[var(--text-primary)]">
        {title}
      </h2>
      {lede ? <p className="type-body mt-3 max-w-[68ch] text-[var(--text-secondary)]">{lede}</p> : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="type-label mb-3 text-[var(--text-muted)]">{children}</p>;
}

export default function DesignSystemPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />
      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16">
          <PageShell
            breadcrumbs={<Breadcrumbs items={[{ label: "SOCideas", href: "/" }, { label: "Design system" }]} />}
            title="Design system"
            lede="Dirección técnica y cartográfica: cromo sobrio, filetes y tipografía en lugar de tarjetas con sombra. Página interna, no indexada ni enlazada en la navegación."
            meta={
              <>
                <Badge variant="muted">Uso interno</Badge>
                <Badge variant="primary">Poppins, radio 6px, sin degradados</Badge>
              </>
            }
          />

          <nav aria-label="Índice del design system" className="mb-12">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {INDICE.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <Seccion
            id="paleta"
            title="Paleta corporativa"
            lede="Ocho colores con rol fijo. Texto hueso sobre musgo, carbón y rupestre; texto carbón sobre hueso, limo y crisopa. Conífera es relleno de acción, no color de texto."
          >
            <dl className="grid gap-x-8 sm:grid-cols-2">
              {PALETA.map((c) => (
                <div key={c.nombre} className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-4 border-t border-[var(--border-subtle)] py-4">
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-[6px] border border-[var(--border-subtle)] text-sm font-semibold"
                    style={{ background: `var(${c.varName})`, color: c.fg }}
                    aria-hidden="true"
                  >
                    Aa
                  </span>
                  <div className="min-w-0">
                    <dt className="flex flex-wrap items-baseline gap-x-3">
                      <span className="type-h4 text-[var(--text-primary)]">{c.nombre}</span>
                      <code className="tnum text-xs text-[var(--text-muted)]">
                        {c.hex}, {c.varName}
                      </code>
                    </dt>
                    <dd className="type-body-sm mt-1 text-[var(--text-secondary)]">
                      {c.rol} Texto encima: {c.texto.toLowerCase()}.
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="mt-6 max-w-md rounded-[6px] bg-[var(--carbon)] p-5">
              <p className="text-sm text-[var(--hueso)]">
                Retama como acento <span className="font-semibold text-[var(--retama)]">sobre fondo oscuro</span>.
              </p>
            </div>
          </Seccion>

          <Seccion
            id="tokens"
            title="Tokens semánticos"
            lede="En componentes se usan tokens, nunca hex ni colores con nombre de Tailwind. Cambian con el tema claro u oscuro."
          >
            <div className="data-table-wrap rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <table className="data-table min-w-[520px]">
                <caption className="sr-only">Tokens semánticos y uso</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-16">Muestra</th>
                    <th scope="col">Token</th>
                    <th scope="col">Uso</th>
                  </tr>
                </thead>
                <tbody>
                  {SEMANTICOS.map(([token, uso]) => (
                    <tr key={token}>
                      <td>
                        <span
                          className="block h-6 w-10 rounded-[6px] border border-[var(--border-subtle)]"
                          style={{ background: `var(${token})` }}
                          aria-hidden="true"
                        />
                      </td>
                      <td>
                        <code className="text-xs font-semibold">{token}</code>
                      </td>
                      <td className="meta">{uso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>

          <Seccion
            id="tipografia"
            title="Tipografía"
            lede="Poppins en exclusiva. Jerarquía por tamaño y peso, sin mayúsculas sostenidas ni espaciado forzado. Cifras con tnum para alinear columnas."
          >
            <dl className="border-t border-[var(--border-strong)]">
              {TIPOS.map((t) => (
                <div key={t.cls} className="grid gap-2 border-b border-[var(--border-subtle)] py-5 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
                  <dt>
                    <code className="text-xs font-semibold text-[var(--text-primary)]">.{t.cls}</code>
                    <span className="type-body-sm block text-[var(--text-muted)]">{t.uso}</span>
                  </dt>
                  <dd className={`${t.cls} max-w-[68ch] text-[var(--text-primary)]`}>{t.muestra}</dd>
                </div>
              ))}
              <div className="grid gap-2 border-b border-[var(--border-subtle)] py-5 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
                <dt>
                  <code className="text-xs font-semibold text-[var(--text-primary)]">.tnum</code>
                  <span className="type-body-sm block text-[var(--text-muted)]">Cifras tabulares</span>
                </dt>
                <dd className="tnum type-h3 flex flex-wrap gap-x-8 text-[var(--text-primary)]">
                  <span>8.130</span>
                  <span>121.544</span>
                  <span>3.284</span>
                </dd>
              </div>
            </dl>
          </Seccion>

          <Seccion
            id="botones"
            title="Botones"
            lede="Verbo activo, sin flechas ni iconos decorativos. Una sola acción principal por vista. En móvil, 44px de alto mínimo."
          >
            <div className="space-y-8">
              <div>
                <Rotulo>Variantes</Rotulo>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary">Descargar informe</Button>
                  <Button variant="secondary">Consultar la fuente</Button>
                  <Button variant="ghost">Restablecer filtros</Button>
                  <Button variant="danger">Eliminar recinto</Button>
                  <Button variant="link">Ver definición</Button>
                </div>
              </div>
              <div>
                <Rotulo>Estados</Rotulo>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" disabled>
                    Deshabilitado
                  </Button>
                  <Button variant="primary" loading>
                    Cargando
                  </Button>
                </div>
              </div>
              <div>
                <Rotulo>Tamaños (32, 40 y 48px)</Rotulo>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Pequeño</Button>
                  <Button size="md">Mediano</Button>
                  <Button size="lg">Grande</Button>
                </div>
              </div>
              <div>
                <Rotulo>Inverso: solo sobre fondo oscuro</Rotulo>
                <div className="rounded-[6px] bg-[var(--carbon)] p-5">
                  <Button variant="inverse">Consultar un municipio</Button>
                </div>
              </div>
            </div>
          </Seccion>

          <Seccion
            id="badges"
            title="Badges de estado"
            lede="Estado del dato o del módulo, nunca decoración. El punto de 6px es opcional y refuerza el estado sin depender del color."
          >
            <div className="flex flex-wrap gap-3">
              <Badge variant="success" dot>
                Disponible
              </Badge>
              <Badge variant="secondary">Disponible parcial</Badge>
              <Badge variant="primary">En preparación</Badge>
              <Badge variant="muted">Pendiente</Badge>
              <Badge variant="accent">Provisional</Badge>
              <Badge variant="danger" dot>
                Error de carga
              </Badge>
            </div>
            <p className="type-body-sm mt-4 max-w-[68ch] text-[var(--text-muted)]">
              Variantes del componente Badge: success, secondary, primary, muted, accent y danger.
            </p>
          </Seccion>

          <Seccion
            id="formularios"
            title="Formularios"
            lede="Etiqueta visible asociada al campo. Los errores dicen qué ha pasado y cómo corregirlo."
          >
            <div className="grid max-w-xl gap-5">
              <Input label="Municipio" placeholder="Nombre o código INE, por ejemplo 02069" />
              <Select
                label="Provincia"
                placeholder="Seleccione una provincia"
                options={[
                  { value: "02", label: "Albacete" },
                  { value: "13", label: "Ciudad Real" },
                  { value: "16", label: "Cuenca" },
                ]}
              />
              <Input
                label="Código INE"
                defaultValue="0206"
                error="El código INE tiene 5 dígitos. Revise el valor o busque el municipio por su nombre."
              />
              <Input label="Deshabilitado" placeholder="No editable" disabled />
            </div>
          </Seccion>

          <Seccion
            id="tablas"
            title="Tablas"
            lede="Clase data-table: divisores en lugar de cebra, cabeceras en minúscula de frase, cifras alineadas a la derecha con .num. En móvil, desplazamiento dentro del contenedor, nunca de la página."
          >
            <div className="data-table-wrap rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <table className="data-table min-w-[520px]">
                <caption className="sr-only">Ejemplo de tabla de datos</caption>
                <thead>
                  <tr>
                    <th scope="col">Indicador</th>
                    <th scope="col" className="num">Valor</th>
                    <th scope="col">Fuente</th>
                    <th scope="col">Año</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Población", "16.489", "INE, Padrón", "2025", "Disponible"],
                    ["Renta media por persona", "—", "INE, ADRH", "2023", "En preparación"],
                    ["Paro registrado", "—", "SEPE", "—", "Pendiente"],
                  ].map((fila) => (
                    <tr key={fila[0]}>
                      <td>{fila[0]}</td>
                      <td className="num">{fila[1]}</td>
                      <td className="meta">{fila[2]}</td>
                      <td className="meta tnum">{fila[3]}</td>
                      <td>
                        <Badge variant={fila[4] === "Disponible" ? "success" : fila[4] === "Pendiente" ? "muted" : "primary"}>
                          {fila[4]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="type-body-sm mt-3 text-[var(--text-muted)]">
              Valores de ejemplo. La ausencia de dato se muestra como «—», nunca como cero.
            </p>
          </Seccion>

          <Seccion id="notas" title="Notas y estados" lede="Notas metodológicas y avisos con la clase note; estados vacíos y de carga que describen la situación.">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <Rotulo>.note</Rotulo>
                <div className="note">
                  <p className="font-semibold text-[var(--text-primary)]">Limitación: rezagos de publicación</p>
                  <p className="mt-1">Cada indicador muestra su año de referencia para evitar lecturas anacrónicas.</p>
                </div>
              </div>
              <div>
                <Rotulo>.note.note-danger</Rotulo>
                <div className="note note-danger">
                  <p className="font-semibold text-[var(--text-primary)]">No se ha podido cargar la capa</p>
                  <p className="mt-1">El servicio WMS no responde. Vuelva a intentarlo en unos minutos.</p>
                </div>
              </div>
              <div>
                <Rotulo>EmptyState</Rotulo>
                <EmptyState
                  title="Sin resultados"
                  description="Pruebe con el nombre oficial o con el código INE de 5 dígitos."
                  action={
                    <Button variant="secondary" size="sm">
                      Restablecer filtros
                    </Button>
                  }
                />
              </div>
              <div>
                <Rotulo>LoadingState</Rotulo>
                <LoadingState title="Cargando indicadores…" lines={4} />
              </div>
              <div>
                <Rotulo>KpiNumber (estático, sin animación)</Rotulo>
                <div className="grid grid-cols-2 gap-6 border-t border-[var(--border-strong)] pt-4">
                  <KpiNumber value="8.130" label="Municipios con ficha" />
                  <KpiNumber value="2023" label="Último año de renta" />
                </div>
              </div>
            </div>
          </Seccion>

          <Seccion
            id="estructura"
            title="Estructura de página"
            lede="Dos niveles. Las portadas de plataforma y módulo usan la hoja cartográfica; las páginas interiores, PageShell sobre el fondo de página dentro de container-ima. Sin bandas musgo a sangre."
          >
            <div className="space-y-12">
              <div>
                <h3 className="type-h3 text-[var(--text-primary)]">MapSheet</h3>
                <p className="type-body-sm mt-2 max-w-[68ch] text-[var(--text-secondary)]">
                  Marco con retícula rotulada y cajetín opcional (legend). El relieve se desactiva con relief=false
                  cuando el contenido ocupa todo el ancho.
                </p>
                <div className="mt-6">
                  <MapSheet
                    legend={[
                      { label: "Municipios", value: "8.130" },
                      { label: "Fuentes", value: "INE, AEAT" },
                    ]}
                  >
                    <div className="max-w-[36rem]">
                      <p className="type-label text-[var(--moss-ink)]">Módulo</p>
                      <p className="type-h1 mt-3 max-w-[17ch] text-[var(--text-primary)]">Título de portada del módulo</p>
                      <p className="type-body-lg mt-4 text-[var(--text-secondary)]">
                        Entradilla de una o dos líneas que dice qué hace la herramienta.
                      </p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <Button variant="primary">Acción principal</Button>
                        <Button variant="secondary">Acción secundaria</Button>
                      </div>
                    </div>
                  </MapSheet>
                </div>
              </div>

              <div>
                <h3 className="type-h3 text-[var(--text-primary)]">PageShell</h3>
                <p className="type-body-sm mt-2 max-w-[68ch] text-[var(--text-secondary)]">
                  Cabecera de página interior. La cabecera de esta misma página es un PageShell.
                </p>
                <div className="data-table-wrap mt-6 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                  <table className="data-table min-w-[480px]">
                    <caption className="sr-only">Propiedades de PageShell</caption>
                    <thead>
                      <tr>
                        <th scope="col">Propiedad</th>
                        <th scope="col">Contenido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["breadcrumbs", "Componente Breadcrumbs con la ruta hasta la página."],
                        ["title", "Título de la página (h1)."],
                        ["lede", "Entradilla, máximo unos 62 caracteres por línea."],
                        ["meta", "Badges de estado o fuente."],
                        ["actions", "Botones o enlaces con clase btn."],
                        ["eyebrow", "Rótulo opcional; solo si aporta información."],
                      ].map(([prop, uso]) => (
                        <tr key={prop}>
                          <td>
                            <code className="text-xs font-semibold">{prop}</code>
                          </td>
                          <td className="meta">{uso}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="type-h3 text-[var(--text-primary)]">Índice de módulo (module-index)</h3>
                <p className="type-body-sm mt-2 max-w-[68ch] text-[var(--text-secondary)]">
                  Lista de herramientas o secciones con nombre enlazado y descripción, entre filetes.
                </p>
                <dl className="module-index mt-6">
                  {[
                    { nombre: "Mapa y dictamen", href: "/urbideas/mapa", desc: "Dibuje o suba un recinto y cruce el suelo con sus afecciones." },
                    { nombre: "Municipios", href: "/urbideas/municipios", desc: "Planeamiento urbanístico vigente de cualquier municipio." },
                    { nombre: "Metodología", href: "/socideas/como-funciona", desc: "Fuentes, cobertura y límites de SOCideas." },
                  ].map((h) => (
                    <div key={h.nombre} className="module-index__row">
                      <dt>
                        <Link href={h.href} className="module-index__name">
                          {h.nombre}
                        </Link>
                      </dt>
                      <dd className="module-index__desc">{h.desc}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <h3 className="type-h3 text-[var(--text-primary)]">Secuencia numerada (step-list)</h3>
                <p className="type-body-sm mt-2 max-w-[68ch] text-[var(--text-secondary)]">
                  Solo para procesos reales con orden. Una lista sin orden no se numera.
                </p>
                <ol className="step-list mt-6">
                  {[
                    { t: "Delimitar el ámbito", d: "Dibújelo sobre el mapa o suba un KML, GeoJSON o shapefile." },
                    { t: "Cruzar afecciones", d: "El recinto se superpone con las capas oficiales." },
                    { t: "Leer el dictamen", d: "Compatible, condicionado o incompatible." },
                    { t: "Descargar el expediente", d: "PDF del dictamen o paquete con las capas del cruce." },
                  ].map((p, i) => (
                    <li key={p.t} className="step-list__item">
                      <span className="step-list__n" aria-hidden="true">
                        {i + 1}
                      </span>
                      <h4 className="type-h4 text-[var(--text-primary)]">{p.t}</h4>
                      <p className="type-body-sm mt-2 text-[var(--text-secondary)]">{p.d}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Seccion>

          <Seccion id="contrastes" title="Matriz de contrastes aplicada" lede="Combinaciones verificadas frente a WCAG 2.1 AA para texto normal (4,5:1).">
            <div className="data-table-wrap rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <table className="data-table min-w-[480px]">
                <caption className="sr-only">Contrastes de color verificados</caption>
                <thead>
                  <tr>
                    <th scope="col">Combinación</th>
                    <th scope="col" className="num">Ratio</th>
                    <th scope="col">WCAG AA</th>
                  </tr>
                </thead>
                <tbody>
                  {CONTRASTES.map((fila) => (
                    <tr key={fila[0]}>
                      <td>{fila[0]}</td>
                      <td className="num">{fila[1]}</td>
                      <td className="meta">{fila[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="type-body-sm mt-3 text-[var(--text-muted)]">
              Verificación reproducible: <code>node design-audit/verify-contrast.mjs</code>
            </p>
          </Seccion>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
