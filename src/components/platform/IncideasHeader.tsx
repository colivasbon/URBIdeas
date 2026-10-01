"use client";

import ProductNavbar from "./ProductNavbar";
import { incideasNavConfig, type IncideasContext } from "./product-nav-config";

export default function IncideasHeader({ codigoINE, search }: IncideasContext) {
  return <ProductNavbar config={incideasNavConfig({ codigoINE, search })} />;
}
