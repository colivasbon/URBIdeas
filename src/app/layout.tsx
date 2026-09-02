import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

export const metadata: Metadata = {
  title: "Herramienta de apoyo al Urbanismo | Ideas Medioambientales",
  description: "Herramienta de apoyo al urbanismo — centralización y consulta de información pública de planeamiento urbanístico de España: legislación, PGOU y capas WMS/WFS.",
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
