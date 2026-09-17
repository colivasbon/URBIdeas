import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

// Poppins corporativa (400/500/600/700) servida por next/font (self-hosted).
// ALCANCE: todo el dominio (URBideas + SOCideas comparten este layout raíz).
// No hay razón técnica en contra: un único layout, sin fuentes por sección,
// pesos suficientes para jerarquía institucional (600/700) y datos (400/500).
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
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
      <body className="min-h-full flex flex-col" style={{ fontFamily: "var(--font-poppins), 'Poppins', system-ui, -apple-system, sans-serif" }}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
