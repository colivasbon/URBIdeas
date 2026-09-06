"use client";

import ProductNavbar from "./ProductNavbar";
import { urbideasNavConfig } from "./product-nav-config";

export default function UrbideasHeader() {
  return <ProductNavbar config={urbideasNavConfig()} />;
}
