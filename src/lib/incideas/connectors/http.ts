export const USER_AGENT =
  "INCideas-piloto/0.1 (IDEAS Medioambientales; soporte@ideasmedioambientales.com)";

export interface FetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  reintentos?: number;
  pausaMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch con User-Agent identificable, timeout y reintentos con espera creciente. */
export async function fetchConReintentos(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const reintentos = options.reintentos ?? 3;
  const timeoutMs = options.timeoutMs ?? 60000;
  const pausaMs = options.pausaMs ?? 3000;
  let ultimoError: unknown;

  for (let intento = 1; intento <= reintentos; intento++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: { "User-Agent": USER_AGENT, ...(options.headers ?? {}) },
        body: options.body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const cuerpo = res.status === 403 ? (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200) : "";
        throw new Error(`HTTP ${res.status} ${res.statusText} en ${url.split("?")[0]}${cuerpo ? ` · ${cuerpo}` : ""}`);
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      ultimoError = err;
      if (intento < reintentos) await sleep(pausaMs * intento);
    }
  }
  throw new Error(
    `Fallo tras ${reintentos} intentos: ${ultimoError instanceof Error ? ultimoError.message : String(ultimoError)}`
  );
}
