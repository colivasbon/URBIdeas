import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Registro Urbanístico España | Ideas Medioambientales",
  description: "Centralización y consulta de información pública de planeamiento urbanístico de España: legislación, PGOU y capas WMS/WFS.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col" style={{ fontFamily: "var(--font-family)" }}>
        {children}
      </body>
    </html>
  );
}
