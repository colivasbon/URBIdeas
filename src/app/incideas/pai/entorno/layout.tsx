import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Análisis de entorno · PAI · INCideas",
  description:
    "Distancias y rumbos desde una instalación a núcleos, infraestructuras, espacios protegidos, masa forestal, MUP, cauces y zonas inundables para Planes de Autoprotección.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
