"use client";

import ProductNavbar from "./ProductNavbar";
import { CORPORATE_URL, platformNavConfig } from "./product-nav-config";

export { CORPORATE_URL };

export default function PlatformHeader() {
  return <ProductNavbar config={platformNavConfig()} />;
}
