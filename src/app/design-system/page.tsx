import type { Metadata } from "next";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import { Button } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import KpiNumber from "@/components/ui/KpiNumber";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const SEMANTICOS = [
  ["--bg-canvas", "var(--bg-canvas)", "Fondo de página"],
  ["--bg-surface", "var(--bg-surface)", "Superficie de cards"],
  ["--bg-surface-sunken", "var(--bg-surface-sunken)", "Cabeceras de tabla"],
  ["--bg-inverse", "var(--bg-inverse)", "Banda de marca"],
  ["--text-primary", "var(--text-primary)", "Texto principal"],
  ["--text-secondary", "var(--text-secondary)", "Texto secundario"],
  ["--text-muted", "var(--text-muted)", "Metadatos"],
  ["--text-link", "var(--text-link)", "Enlaces"],
  ["--border-subtle", "var(--border-subtle)", "Divisores"],
  ["--border-default", "var(--border-default)", "Bordes UI"],
  ["--border-focus", "var(--border-focus)", "Foco"],
  ["--action-primary-bg", "var(--action-primary-bg)", "CTA"],
  ["--action-primary-fg", "var(--action-primary-fg)", "Texto del CTA"],
];

const ESCALAS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const FAMILIAS = ["musgo", "conifera", "carbon", "rupestre", "limo", "crisopa"];

const CONTRASTES = [
  ["Hueso sobre musgo", "5,70:1", "OK"],
  ["Musgo sobre hueso", "5,70:1", "OK"],
  ["Retama sobre musgo", "4,88:1", "OK"],
  ["Carbón-900 sobre conífera (CTA)", "6,79:1", "OK"],
  ["Carbón-900 sobre conífera-600 (hover)", "4,64:1", "OK"],
  ["Hueso sobre rupestre", "9,00:1", "OK"],
  ["Musgo-700 sobre musgo-50 (badge)", "9,60:1", "OK"],
  ["Carbón sobre crisopa (badge)", "7,23:1", "OK"],
];

export default function DesignSystemPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />
      <main id="contenido" className="flex-1">
        <div className="container-ima py-12">
          <Breadcrumbs items={[{ label: "IDEAS Sostenibilidad", href: "/" }, { label: "Design system" }]} />
          <p className="type-overline mt-5 text-[var(--moss-ink)]">Sistema IMA · Validación interna</p>
          <h1 className="type-h1 mt-3 text-[var(--text-primary)]">Design system</h1>
          <p className="measure mt-4 text-[var(--text-secondary)]">
            Tokens, tipografía y componentes con sus estados. Página interna (noindex), no
            enlazada en la navegación.
          </p>

          {/* Tokens semánticos */}
          <section className="mt-14" aria-labelledby="tokens">
            <h2 id="tokens" className="type-h2 text-[var(--text-primary)]">
              Tokens semánticos
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SEMANTICOS.map(([token, value, uso]) => (
                <div key={token} className="card flex items-center gap-4 p-4">
                  <span
                    className="h-10 w-10 shrink-0 rounded-[6px] border border-[var(--border-subtle)]"
                    style={{ background: value }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <code className="block truncate text-xs font-semibold text-[var(--text-primary)]">{token}</code>
                    <span className="block text-xs text-[var(--text-muted)]">{uso}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Escalas */}
          <section className="mt-14" aria-labelledby="escalas">
            <h2 id="escalas" className="type-h2 text-[var(--text-primary)]">
              Escalas
            </h2>
            <div className="mt-6 space-y-4">
              {FAMILIAS.map((familia) => (
                <div key={familia}>
                  <p className="type-label text-[var(--text-secondary)]">{familia}</p>
                  <div className="mt-2 flex overflow-hidden rounded-[6px] border border-[var(--border-subtle)]">
                    {ESCALAS.map((paso) => (
                      <span
                        key={paso}
                        className="h-10 flex-1"
                        style={{ background: `var(--${familia}-${paso})` }}
                        title={`--${familia}-${paso}`}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex gap-3">
                <span className="h-10 w-24 rounded-[6px] border border-[var(--border-subtle)]" style={{ background: "var(--retama)" }} title="--retama" />
                <span className="h-10 w-24 rounded-[6px] border border-[var(--border-subtle)]" style={{ background: "var(--hueso)" }} title="--hueso" />
              </div>
            </div>
          </section>

          {/* Tipografía */}
          <section className="mt-14" aria-labelledby="tipografia">
            <h2 id="tipografia" className="type-h2 text-[var(--text-primary)]">
              Tipografía
            </h2>
            <div className="mt-6 space-y-5">
              <p className="type-display text-[var(--text-primary)]">Display · decisiones sostenibles</p>
              <p className="type-h1 text-[var(--text-primary)]">H1 · análisis territorial</p>
              <p className="type-h2 text-[var(--text-primary)]">H2 · diagnóstico municipal</p>
              <p className="type-h3 text-[var(--text-primary)]">H3 · cobertura y fuentes</p>
              <p className="type-h4 text-[var(--text-primary)]">H4 · indicador y año</p>
              <p className="type-body-lg measure text-[var(--text-secondary)]">
                Body large · para entradillas y textos de apoyo con medida de línea de 68ch.
              </p>
              <p className="type-body measure text-[var(--text-secondary)]">
                Body · texto corrido de lectura.
              </p>
              <p className="type-body-sm text-[var(--text-secondary)]">Body small · notas al pie de dato.</p>
              <p className="type-label text-[var(--text-secondary)]">Label · etiquetas de campo</p>
              <p className="type-overline text-[var(--moss-ink)]">Overline · módulos</p>
              <p className="type-data-xl text-[var(--text-primary)]">8.130</p>
            </div>
          </section>

          {/* Botones */}
          <section className="mt-14" aria-labelledby="botones">
            <h2 id="botones" className="type-h2 text-[var(--text-primary)]">
              Botones
            </h2>
            <div className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primario</Button>
                <Button variant="secondary">Secundario</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Destructivo</Button>
                <Button variant="link">Enlace</Button>
                <Button variant="primary" disabled>
                  Deshabilitado
                </Button>
                <Button variant="primary" loading>
                  Cargando
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small 32</Button>
                <Button size="md">Medium 40</Button>
                <Button size="lg">Large 48</Button>
              </div>
              <div className="rounded-[6px] bg-[var(--bg-inverse)] p-6">
                <Button variant="inverse">Inverso sobre musgo</Button>
              </div>
            </div>
          </section>

          {/* Badges */}
          <section className="mt-14" aria-labelledby="badges">
            <h2 id="badges" className="type-h2 text-[var(--text-primary)]">
              Badges de estado
            </h2>
            <div className="mt-6 flex flex-wrap gap-3">
              <Badge variant="secondary" dot>Módulo disponible</Badge>
              <Badge variant="muted">Beta interna</Badge>
              <Badge variant="primary" dot>Demografía disponible</Badge>
              <Badge variant="accent">En preparación</Badge>
              <Badge variant="danger" dot>Error de datos</Badge>
              <Badge variant="success" dot>Actualizado</Badge>
            </div>
          </section>

          {/* Cards y KPI */}
          <section className="mt-14" aria-labelledby="cards">
            <h2 id="cards" className="type-h2 text-[var(--text-primary)]">
              Cards y cifras
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Card base</CardTitle>
                </CardHeader>
                <p className="text-sm text-[var(--text-secondary)]">
                  Superficie, borde sutil, sombra 1 y radio 6px.
                </p>
              </Card>
              <Card hover>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="type-overline text-[var(--moss-ink)]">Módulo disponible</span>
                  <Badge variant="secondary" dot>Disponible</Badge>
                </div>
                <h3 className="type-h3 mt-3 text-[var(--text-primary)]">Card interactiva</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Hover con elevación y acento superior en conífera.
                </p>
              </Card>
              <Card>
                <KpiNumber value="8.130" label="Municipios con ficha territorial" />
              </Card>
              <Card>
                <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)]">
                  <KpiNumber value="121.544" label="Instrumentos" className="pr-4" />
                  <KpiNumber value="3.284" label="Capas WMS" className="pl-4" />
                </div>
              </Card>
            </div>
          </section>

          {/* Formularios */}
          <section className="mt-14" aria-labelledby="formularios">
            <h2 id="formularios" className="type-h2 text-[var(--text-primary)]">
              Formularios
            </h2>
            <div className="mt-6 grid max-w-xl gap-5">
              <Input label="Municipio" placeholder="La Roda, Álava, 02069" />
              <Input
                label="Con error"
                defaultValue="0206"
                error="El código INE debe tener 5 dígitos."
              />
              <Input label="Deshabilitado" placeholder="No editable" disabled />
            </div>
          </section>

          {/* Tablas */}
          <section className="mt-14" aria-labelledby="tablas">
            <h2 id="tablas" className="type-h2 text-[var(--text-primary)]">
              Tablas
            </h2>
            <div className="data-table-wrap mt-6 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <table className="data-table">
                <caption className="sr-only">Ejemplo de tabla de datos</caption>
                <thead>
                  <tr>
                    <th scope="col">Indicador</th>
                    <th scope="col" className="num">Valor</th>
                    <th scope="col">Fuente</th>
                    <th scope="col">Año</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Población", "16.489", "INE · Padrón", "2025"],
                    ["Renta media", "24.310 €", "AEAT", "2023"],
                    ["Contratos", "4.902", "SEPE", "2025"],
                  ].map((fila) => (
                    <tr key={fila[0]}>
                      <td>{fila[0]}</td>
                      <td className="num">{fila[1]}</td>
                      <td className="meta">{fila[2]}</td>
                      <td className="meta">{fila[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Estados */}
          <section className="mt-14" aria-labelledby="estados">
            <h2 id="estados" className="type-h2 text-[var(--text-primary)]">
              Estados vacíos, carga y avisos
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <EmptyState
                title="Sin resultados"
                description="Prueba con el nombre oficial o el código INE de 5 dígitos."
                action={<Button variant="secondary" size="sm">Limpiar filtros</Button>}
              />
              <Card>
                <LoadingState title="Cargando indicadores…" lines={4} />
              </Card>
              <div className="note">
                Nota informativa: fondo musgo-50 con borde izquierdo de 3px. Para validez
                jurídica, acuda al texto publicado en sede electrónica.
              </div>
              <div className="note note-danger">
                Aviso: este expediente contiene datos provisionales.
              </div>
            </div>
          </section>

          {/* Contrastes */}
          <section className="mt-14" aria-labelledby="contrastes">
            <h2 id="contrastes" className="type-h2 text-[var(--text-primary)]">
              Matriz de contrastes aplicada
            </h2>
            <div className="data-table-wrap mt-6 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <table className="data-table">
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
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Verificación reproducible: <code>node design-audit/verify-contrast.mjs</code>
            </p>
          </section>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
