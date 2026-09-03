import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

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
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col" style={{ fontFamily: "var(--font-family)" }}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
