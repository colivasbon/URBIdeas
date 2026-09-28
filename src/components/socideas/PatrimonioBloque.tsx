// Bloque «Patrimonio y turismo» de la ficha municipal.
//
// Presentacional y de servidor: consume el enriquecimiento ya sincronizado
// (src/lib/wikipedia-enrichment.ts → R2 `socideas/wikipedia/{ine}.json`).
// Estilo y primitivas del sistema (ideas-h2, premium-card, ideas-status,
// variables --color-*); sin dependencias nuevas ni estilos propios.
//
// Reglas editoriales:
//  · la imagen SOLO se muestra si en la sincronización se acreditó licencia
//    libre (si no, simplemente no está en el dato);
//  · el estado `not_found` es un mensaje sereno, nunca un hueco ni un error;
//  · atribución visible y obligatoria a Wikipedia (CC BY-SA 4.0) + aviso de
//    que el contenido puede no estar actualizado.
import type { WikipediaEnrichment } from "@/lib/wikipedia-enrichment";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Fecha legible y determinista (sin depender del locale del servidor). */
function fechaLarga(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match === null) return iso;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return iso;
  return `${Number(match[3])} de ${MESES[month - 1]} de ${match[1]}`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max - 1);
  const cut = head.replace(/\s+\S*$/, "");
  return `${cut.length > 0 ? cut : head}…`;
}

function wikipediaArticleUrl(url: string | null, title: string): string {
  if (url) return url;
  return `https://es.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function osmUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
}

function commonsUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=800`;
}

/** P571 de Wikidata: «-0231» → «231 a. C.» (año negativo = antes de Cristo). */
function formatFounded(raw: string): string {
  const match = /^(-?)(\d+)$/.exec(raw.trim());
  if (match === null) return raw;
  const year = match[2].replace(/^0+(?=\d)/, "");
  return match[1] === "-" ? `${year} a. C.` : year;
}

const LINK_INLINE =
  "font-medium text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]";

export interface PatrimonioBloqueProps {
  /** Enriquecimiento leído de R2 (null = sin dato sincronizado todavía). */
  data: WikipediaEnrichment | null;
  /** Nombre visible del municipio en la ficha (fallback: data.municipalityName). */
  municipio?: string;
}

export function PatrimonioBloque({ data, municipio }: PatrimonioBloqueProps) {
  const nombre = municipio?.trim() || data?.municipalityName || "";
  const status = data?.status ?? "not_found";
  const article = data?.wikipedia ?? null;
  const wd = data?.wikidata ?? null;
  const heritage = data?.heritageSites ?? [];

  const caption = (
    <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
      Resumen enciclopédico y bienes protegidos{nombre !== "" ? ` de ${nombre}` : ""}, según Wikipedia y Wikidata.
    </p>
  );

  if (data === null || article === null) {
    const esError = status === "error";
    return (
      <section
        id="patrimonio-turismo"
        aria-label="Patrimonio y turismo"
        className="scroll-mt-24 border-t border-[var(--border-subtle)] py-10"
      >
        <h2 className="type-h3 text-[var(--text-primary)]">Patrimonio y turismo</h2>
        {caption}
        <div className="mt-4 rounded-[6px] border border-dashed border-[var(--border-default)] px-5 py-4" data-state="pending" role="status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-h4 text-[var(--text-primary)]">
              {esError
                ? "Contenido enciclopédico no disponible temporalmente"
                : "Sin artículo de Wikipedia para este municipio"}
            </p>
            <span className="socideas-badge" data-tone={esError ? "error" : "draft"}>
              <span aria-hidden="true" className="socideas-badge__dot" />
              {esError ? "No disponible" : "Sin contenido"}
            </span>
          </div>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
            {esError
              ? "No se ha podido consultar la fuente enciclopédica en este momento. No se sustituye por otro texto ni se estiman datos; recargue la página más tarde."
              : "Este municipio no tiene artículo propio en la Wikipedia en español con contenido verificable. No se muestra ningún texto de otro municipio ni se rellena con descripciones genéricas."}
          </p>
          <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
            Fuentes previstas: es.wikipedia.org (texto, CC BY-SA 4.0) y Wikidata (entidades y bienes protegidos).
          </p>
        </div>
      </section>
    );
  }

  const thumb = article.thumbnail;
  const fallbackImage =
    thumb === undefined && wd?.mainImage !== undefined
      ? { url: commonsUrl(wd.mainImage), license: wd.mainImageLicense }
      : null;
  const image = thumb ?? fallbackImage;
  const articleUrl = wikipediaArticleUrl(article.url, article.title);
  const summary = truncate(article.summary, 800);
  const coords = wd?.coordinates;
  // Coordenadas redondeadas a 4 decimales: mismas cifras en el texto y en el
  // enlace de OpenStreetMap (nada de URLs con 12 decimales).
  const lat = coords !== undefined ? Number(coords.lat.toFixed(4)) : null;
  const lon = coords !== undefined ? Number(coords.lon.toFixed(4)) : null;
  const alt = `${article.title}, vista de ${nombre || article.title}. Imagen procedente de Wikipedia, La enciclopedia libre (artículo «${article.title}»).`;

  return (
    <section
      id="patrimonio-turismo"
      aria-label="Patrimonio y turismo"
      className="scroll-mt-24 border-t border-[var(--border-subtle)] py-10"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h3 text-[var(--text-primary)]">Patrimonio y turismo</h2>
          {caption}
        </div>
        <span className="socideas-badge">Wikipedia, Wikidata</span>
      </div>

      <div className={`mt-6 grid gap-8${image !== null ? " lg:grid-cols-3" : ""}`}>
        <div className={`min-w-0${image !== null ? " lg:col-span-2" : ""}`}>
          <p className="max-w-[70ch] leading-relaxed text-[var(--text-primary)]">{summary}</p>

          {wd !== null && (
            <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
              {lat !== null && lon !== null && (
                <div>
                  <dt className="text-xs font-medium text-[var(--text-muted)]">
                    Coordenadas
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--text-secondary)]">
                    <span className="tabular-nums">
                      {lat}, {lon}
                    </span>
                    {". "}
                    <a
                      href={osmUrl(lat, lon)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={LINK_INLINE}
                    >
                      Ver en OpenStreetMap
                    </a>
                  </dd>
                </div>
              )}
              {wd.officialWebsite !== undefined && (
                <div>
                  <dt className="text-xs font-medium text-[var(--text-muted)]">
                    Web oficial
                  </dt>
                  <dd className="mt-1 text-sm">
                    <a
                      href={wd.officialWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={LINK_INLINE}
                    >
                      Sitio oficial del municipio
                    </a>
                  </dd>
                </div>
              )}
              {wd.founded !== undefined && (
                <div>
                  <dt className="text-xs font-medium text-[var(--text-muted)]">
                    Fundación (Wikidata)
                  </dt>
                  <dd className="mt-1 text-sm tabular-nums text-[var(--text-secondary)]">
                    {formatFounded(wd.founded)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-[var(--text-muted)]">
                  Ficha en Wikidata
                </dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={`https://www.wikidata.org/wiki/${wd.qid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${LINK_INLINE} tabular-nums`}
                  >
                    {wd.qid}
                  </a>
                </dd>
              </div>
            </dl>
          )}
        </div>

        {image !== null && (
          <figure className="min-w-0">
            <div className="overflow-hidden rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen externa de Commons, sin loader local */}
              <img
                src={image.url}
                alt={alt}
                loading="lazy"
                decoding="async"
                {...(thumb !== undefined ? { width: thumb.width, height: thumb.height } : {})}
                className="h-auto w-full object-cover"
              />
            </div>
            <figcaption className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Imagen con licencia libre verificada
              {image.license !== undefined && image.license !== "" ? ` (${image.license})` : ""}. Wikipedia, La
              enciclopedia libre, artículo «{article.title}».
            </figcaption>
          </figure>
        )}
      </div>

      <div className="mt-10">
        <h3 className="type-h4 text-[var(--text-primary)]">Bienes patrimoniales</h3>
        {heritage.length > 0 ? (
          <>
            <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
              Bienes con figura de protección declarada en el término municipal (Wikidata, propiedad P1435).
              Wikidata complementa, no sustituye, los registros oficiales de BIC.
              No se interpreta P1435 sin calificación específica.
            </p>
            <div className="socideas-table-shell__scroll overflow-x-auto">
              <table className="socideas-table min-w-[32rem]">
                <caption className="sr-only">
                  Bienes patrimoniales protegidos en {nombre || article.title} y su figura de protección
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="socideas-table__text">
                      Bien
                    </th>
                    <th scope="col" className="socideas-table__text">
                      Figura de protección
                    </th>
                    <th scope="col" className="socideas-table__text">
                      Fuente
                    </th>
                    <th scope="col" className="socideas-table__text">
                      Ficha
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {heritage.map((site) => (
                    <tr key={site.qid}>
                      <td className="socideas-table__text">{site.title}</td>
                      <td>{site.heritageType}</td>
                      <td className="text-[var(--text-muted)]">
                        Wikidata (P1435)
                      </td>
                      <td>
                        <a href={site.url} target="_blank" rel="noopener noreferrer" className={LINK_INLINE}>
                          Ver
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
              <strong className="font-semibold text-[var(--text-secondary)]">Prioridad:</strong> registros oficiales de BIC de la comunidad autónoma correspondiente.
              Wikidata es una fuente complementaria y puede no estar actualizada.
            </p>
          </>
        ) : (
          <p className="mt-2 max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            Sin bienes con figura de protección declarados en Wikidata para este municipio. El inventario puede estar
            incompleto: los registros oficiales de protección dependen de las comunidades autónomas.
            Consulte el registro oficial de BIC de la comunidad autónoma.
          </p>
        )}
      </div>

      <p className="mt-8 max-w-[70ch] border-t border-[var(--border-subtle)] pt-4 text-[13px] leading-relaxed text-[var(--text-muted)]">
        Texto extraído de Wikipedia, La enciclopedia libre. Artículo:{" "}
        <a href={articleUrl} target="_blank" rel="noopener noreferrer" className={LINK_INLINE}>
          {article.title}
        </a>
        . Licencia CC BY-SA 4.0. Consultado el {fechaLarga(data.retrievedAt)}.
      </p>
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        Este contenido puede no estar actualizado. Consulte Wikipedia para la versión más reciente.
      </p>
    </section>
  );
}

/** Esqueleto de carga del bloque (mismo lenguaje que el resto de la ficha). */
export function PatrimonioSkeleton() {
  return (
    <section
      id="patrimonio-turismo"
      aria-label="Patrimonio y turismo"
      aria-busy="true"
      className="scroll-mt-24 border-t border-[var(--border-subtle)] py-10"
    >
      <div className="premium-skeleton h-6 w-56 max-w-full rounded-[6px]" />
      <div className="premium-skeleton mt-3 h-4 w-72 max-w-full rounded-[6px]" />
      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="premium-skeleton h-4 w-full rounded-[6px]" />
          <div className="premium-skeleton h-4 w-full rounded-[6px]" />
          <div className="premium-skeleton h-4 w-5/6 rounded-[6px]" />
          <div className="premium-skeleton h-4 w-2/3 rounded-[6px]" />
        </div>
        <div className="premium-skeleton aspect-[4/3] w-full rounded-[6px]" />
      </div>
      <div className="premium-skeleton mt-5 h-32 w-full rounded-[6px]" />
    </section>
  );
}
