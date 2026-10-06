import { inflateSync } from "node:zlib";

// Decodificador PNG mínimo (solo servidor) para leer la opacidad de teselas WMS.
// Cubre lo que devuelven los WMS INSPIRE: PNG no entrelazado, 8 bits (gris, RGB, RGBA,
// gris+alfa) y paleta de 1-8 bits con transparencia tRNS.

export interface PngAlfa {
  width: number;
  height: number;
  /** Opacidad por píxel (0-255), fila a fila. */
  alfa: Uint8Array;
}

export function decodificarAlfaPng(buf: Buffer): PngAlfa {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!firma.every((b, i) => buf[i] === b)) throw new Error("No es un PNG");

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let interlace = 0;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const tipo = buf.toString("ascii", pos + 4, pos + 8);
    const datos = buf.subarray(pos + 8, pos + 8 + len);
    if (tipo === "IHDR") {
      width = datos.readUInt32BE(0);
      height = datos.readUInt32BE(4);
      bitDepth = datos[8];
      colorType = datos[9];
      interlace = datos[12];
    } else if (tipo === "tRNS") trns = Buffer.from(datos);
    else if (tipo === "IDAT") idat.push(datos);
    else if (tipo === "IEND") break;
    pos += 12 + len;
  }
  if (interlace) throw new Error("PNG entrelazado no soportado");
  if (colorType !== 3 && bitDepth !== 8) throw new Error(`Profundidad ${bitDepth} no soportada`);

  const canales = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType as 0 | 2 | 3 | 4 | 6];
  if (!canales) throw new Error(`Tipo de color ${colorType} no soportado`);
  const bitsPixel = canales * bitDepth;
  const bpp = Math.max(1, bitsPixel >> 3);
  const bytesFila = Math.ceil((width * bitsPixel) / 8);
  const raw = inflateSync(Buffer.concat(idat));

  const alfa = new Uint8Array(width * height);
  let prev = new Uint8Array(bytesFila);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filtro = raw[p++];
    const fila = new Uint8Array(raw.subarray(p, p + bytesFila));
    p += bytesFila;
    for (let i = 0; i < bytesFila; i++) {
      const a = i >= bpp ? fila[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = fila[i];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      fila[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      let o = 255;
      if (colorType === 6) o = fila[x * 4 + 3];
      else if (colorType === 4) o = fila[x * 2 + 1];
      else if (colorType === 3) {
        const bit = x * bitDepth;
        const idx = (fila[bit >> 3] >> (8 - bitDepth - (bit & 7))) & ((1 << bitDepth) - 1);
        o = trns && idx < trns.length ? trns[idx] : 255;
      } else if (trns) {
        // Gris/RGB con color clave transparente (16 bits por muestra en tRNS).
        const clave = colorType === 0 ? [trns.readUInt16BE(0)] : [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)];
        const muestra = Array.from(fila.subarray(x * canales, x * canales + canales));
        if (muestra.every((m, i) => m === clave[i])) o = 0;
      }
      alfa[y * width + x] = o;
    }
    prev = fila;
  }
  return { width, height, alfa };
}
