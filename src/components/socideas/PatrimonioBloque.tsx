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
  "font-medium text-[var(--color-secondary)] underline decoration-[var(--color-secondary)] underline-offset-2 hover:text-[var(--color-text-primary)]";

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
    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
      Resumen enciclopédico y bienes protegidos{nombre !== "" ? ` · ${nombre}` : ""}
    </p>
  );

  if (data === null || article === null) {
    const esError = status === "error";
    return (
      <section
        id="patrimonio-turismo"
        aria-label="Patrimonio y turismo"
        className="premium-card mb-10 scroll-mt-24 p-5 sm:p-6"
      >
        <h2 className="ideas-h2">Patrimonio y turismo</h2>
        {caption}
        <div className="ideas-status mt-4" data-state="pending" role="status">
          <div className="ideas-status__head">
            <p className="ideas-status__title">
              {esError
                ? "Contenido enciclopédico no disponible temporalmente"
                : "Sin artículo de Wikipedia para este municipio"}
            </p>
            <span className="ideas-status__badge">{esError ? "No disponible" : "Sin contenido"}</span>
          </div>
          <div className="ideas-status__body">
            <p>
              {esError
                ? "No se pudo consultar la fuente enciclopédica en este momento. No se sustituye por otro texto ni se estiman datos; vuelve a intentarlo más tarde."
                : "Este municipio no tiene artículo propio en la Wikipedia en español con contenido verificable. No se muestra ningún texto de otro municipio ni se rellena con descripciones genéricas."}
            </p>
          </div>
          <p className="ideas-status__source">
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
      className="premium-card mb-10 scroll-mt-24 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ideas-h2">Patrimonio y turismo</h2>
          {caption}
        </div>
        <span className="rounded-[4px] bg-[var(--color-input-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-muted)]">
          Wikipedia · Wikidata
        </span>
      </div>

      <div className={`mt-4 grid gap-5${image !== null ? " lg:grid-cols-3" : ""}`}>
        <div className={`min-w-0${image !== null ? " lg:col-span-2" : ""}`}>
          <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">{summary}</p>

          {wd !== null && (
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-[var(--color-border-subtle)] pt-3 sm:grid-cols-2">
              {lat !== null && lon !== null && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Coordenadas
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    <span className="tabular-nums">
                      {lat}, {lon}
                    </span>
                    {" · "}
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
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
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
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Fundación (Wikidata)
                  </dt>
                  <dd className="mt-1 text-sm tabular-nums text-[var(--color-text-secondary)]">
                    {formatFounded(wd.founded)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Ficha en Wikidata
                </dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={`https://www.wikidata.org/wiki/${wd.qid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${LINK_INLINE} font-mono`}
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
            <div className="overflow-hidden rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)]">
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
            <figcaption className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
              Imagen con licencia libre verificada
              {image.license !== undefined && image.license !== "" ? ` (${image.license})` : ""} · Wikipedia, La
              enciclopedia libre · Artículo: {article.title}.
            </figcaption>
          </figure>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Bienes patrimoniales</h3>
        {heritage.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Bienes con figura de protección declarada en el término municipal (Wikidata, propiedad P1435).
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <caption className="sr-only">
                  Bienes patrimoniales protegidos en {nombre || article.title} y su figura de protección
                </caption>
                <thead>
                  <tr className="text-left text-xs text-[var(--color-text-muted)]">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Bien
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Figura de protección
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Ficha
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {heritage.map((site) => (
                    <tr key={site.qid} className="border-t border-[var(--color-border-subtle)]">
                      <td className="py-2 pr-4">{site.title}</td>
                      <td className="py-2 pr-4">{site.heritageType}</td>
                      <td className="py-2">
                        <a href={site.url} target="_blank" rel="noopener noreferrer" className={LINK_INLINE}>
                          Wikidata
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Sin bienes con figura de protección declarados en Wikidata para este municipio. El inventario puede estar
            incompleto: los registros oficiales de protección dependen de las comunidades autónomas.
          </p>
        )}
      </div>

      <p className="mt-4 border-t border-[var(--color-border-subtle)] pt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Texto extraído de Wikipedia, La enciclopedia libre. Artículo:{" "}
        <a href={articleUrl} target="_blank" rel="noopener noreferrer" className={LINK_INLINE}>
          {article.title}
        </a>
        . Licencia CC BY-SA 4.0. Consultado el {fechaLarga(data.retrievedAt)}.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Este contenido puede no estar actualizado. Consultar Wikipedia para la versión más reciente.
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
      className="premium-card mb-10 scroll-mt-24 p-5 sm:p-6"
    >
      <div className="premium-skeleton h-6 w-56 max-w-full rounded-[4px]" />
      <div className="premium-skeleton mt-3 h-4 w-72 max-w-full rounded-[4px]" />
      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="premium-skeleton h-4 w-full rounded-[4px]" />
          <div className="premium-skeleton h-4 w-full rounded-[4px]" />
          <div className="premium-skeleton h-4 w-5/6 rounded-[4px]" />
          <div className="premium-skeleton h-4 w-2/3 rounded-[4px]" />
        </div>
        <div className="premium-skeleton aspect-[4/3] w-full rounded-[6px]" />
      </div>
      <div className="premium-skeleton mt-5 h-32 w-full rounded-[6px]" />
    </section>
  );
}
