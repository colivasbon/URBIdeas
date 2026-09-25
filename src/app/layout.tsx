import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

// Poppins corporativa (400/500/600/700) servida por next/font (self-hosted).
// latin + latin-ext: la interfaz es en español y puede mostrar topónimos con
// diacríticos fuera del subconjunto latino básico.
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: {
    default: "IDEAS Sostenibilidad | Ideas Medioambientales",
    template: "%s | IDEAS Sostenibilidad",
  },
  description:
    "Plataforma del Área de Sostenibilidad de Ideas Medioambientales para el análisis territorial, la consulta municipal y el apoyo técnico a proyectos.",
  openGraph: {
    title: "IDEAS Sostenibilidad | Ideas Medioambientales",
    description:
      "Plataforma del Área de Sostenibilidad de Ideas Medioambientales para el análisis territorial, la consulta municipal y el apoyo técnico a proyectos.",
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IDEAS Sostenibilidad | Ideas Medioambientales",
    description:
      "Plataforma del Área de Sostenibilidad de Ideas Medioambientales para el análisis territorial, la consulta municipal y el apoyo técnico a proyectos.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light" className={`h-full antialiased ${poppins.variable}`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
