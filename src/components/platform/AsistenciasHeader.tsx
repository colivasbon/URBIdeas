"use client";

import ProductNavbar from "./ProductNavbar";
import { asistenciasNavConfig } from "./product-nav-config";

export default function AsistenciasHeader() {
  return <ProductNavbar config={asistenciasNavConfig()} />;
}
