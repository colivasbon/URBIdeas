"use client";

import ProductNavbar from "./ProductNavbar";
import { socideasNavConfig, type SocideasContext } from "./product-nav-config";

export default function SocideasHeader({ codigoINE, search }: SocideasContext) {
  return <ProductNavbar config={socideasNavConfig({ codigoINE, search })} />;
}
