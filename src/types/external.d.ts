declare module "@mapbox/togeojson" {
  export function kml(doc: Document): GeoJSON.FeatureCollection;
  export function gpx(doc: Document): GeoJSON.FeatureCollection;
}

declare module "shpjs" {
  function shp(buffer: ArrayBuffer | ArrayBuffer[]): Promise<GeoJSON.FeatureCollection>;
  export default shp;
}

declare module "shp-write" {
  export function zip(geojson: GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]): Promise<Blob | ArrayBuffer | Uint8Array>;
  const _default: { zip: typeof zip };
  export default _default;
}
