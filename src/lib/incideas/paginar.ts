/** Tamaño de página: coincide con el máximo de filas por respuesta de PostgREST en Supabase. */
export const TAM_PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Lee todas las filas de una consulta paginando con `range`. PostgREST trunca en silencio
 * las respuestas al máximo configurado (1000 por defecto), por lo que toda lectura masiva de
 * INCideas debe pasar por aquí. La consulta debe llevar un orden total (p. ej. por `id`) para
 * que las páginas no se solapen.
 */
export async function leerTodas<T>(
  pagina: (desde: number, hasta: number) => Pagina<T>
): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = [];
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await pagina(desde, desde + TAM_PAGINA - 1);
    if (error) return { data: out, error: error.message };
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < TAM_PAGINA) return { data: out, error: null };
  }
}
