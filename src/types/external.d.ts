declare module "@mapbox/togeojson" {
  export function kml(doc: Document): GeoJSON.FeatureCollection;
  export function gpx(doc: Document): GeoJSON.FeatureCollection;
}

declare module "shpjs" {
  function shp(buffer: ArrayBuffer | ArrayBuffer[]): Promise<GeoJSON.FeatureCollection>;
  export default shp;
}
