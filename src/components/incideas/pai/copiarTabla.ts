"use client";

// Copia tablas al portapapeles como HTML con estilo corporativo en línea, para pegarlas en
// Word con el mismo aspecto que las tablas de los PAI (cabecera Musgo, bordes Limo, Poppins).

const ESTILO_TABLA = "border-collapse:collapse;width:100%;font-family:Poppins,Arial,sans-serif;font-size:10pt;color:#3C403E";
const ESTILO_TH = "background:#3E665C;color:#F1F1F1;font-weight:600;padding:6px 8px;border:1px solid #3E665C;text-align:center";
const ESTILO_TD = "padding:6px 8px;border:1px solid #B0BDB0;vertical-align:middle";
const ESTILO_TD_ASPECTO = `${ESTILO_TD};font-weight:600`;

function htmlConEstilos(tablas: HTMLTableElement[]): string {
  return tablas
    .map((t) => {
      const c = t.cloneNode(true) as HTMLTableElement;
      c.removeAttribute("class");
      c.setAttribute("style", ESTILO_TABLA);
      c.querySelectorAll("[data-no-copiar]").forEach((n) => n.remove());
      c.querySelectorAll("th").forEach((th) => {
        th.removeAttribute("class");
        th.setAttribute("style", ESTILO_TH);
      });
      c.querySelectorAll("td").forEach((td) => {
        const aspecto = td.hasAttribute("data-aspecto");
        const alinear = td.getAttribute("data-alinear");
        td.removeAttribute("class");
        td.setAttribute("style", `${aspecto ? ESTILO_TD_ASPECTO : ESTILO_TD}${alinear ? `;text-align:${alinear}` : ""}`);
      });
      c.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
      c.querySelectorAll("button, span, p, div").forEach((n) => n.removeAttribute("class"));
      const titulo = t.dataset.titulo ? `<p style="font-family:Poppins,Arial,sans-serif;font-size:9pt;color:#3C403E;margin:12px 0 4px">${t.dataset.titulo}</p>` : "";
      return `${titulo}${c.outerHTML}`;
    })
    .join("<p></p>");
}

export async function copiarTablas(tablas: (HTMLTableElement | null)[]): Promise<boolean> {
  const validas = tablas.filter((t): t is HTMLTableElement => !!t);
  if (!validas.length) return false;
  const html = htmlConEstilos(validas);
  const texto = validas.map((t) => t.innerText).join("\n\n");
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([texto], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
