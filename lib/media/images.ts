// Image validation for uploads, without native dependencies (no sharp: releases must run
// unchanged on any machine). We accept only PNG, JPEG and WebP, identified by their bytes (never
// by file name or the browser's Content-Type), read their dimensions from the headers, and strip
// JPEG metadata segments (EXIF can contain GPS coordinates). SVG is refused: it can carry script.

export type ImageKind = "png" | "jpg" | "webp" | "ico";

export interface ImageInfo {
  kind: ImageKind;
  mime: "image/png" | "image/jpeg" | "image/webp" | "image/x-icon";
  width: number;
  height: number;
  /** bytes to store (JPEG: metadata segments removed) */
  data: Buffer;
}

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 8000;

export class ImageError extends Error {}

export function inspectImage(input: Buffer): ImageInfo {
  if (input.length === 0) throw new ImageError("文件是空的");
  if (input.length > MAX_IMAGE_BYTES) throw new ImageError("图片不能超过 2 MB");
  const info = sniff(input);
  if (info.width < 1 || info.height < 1 || info.width > MAX_SIDE || info.height > MAX_SIDE) {
    throw new ImageError(`图片尺寸无效（${info.width}×${info.height}），边长需在 1–${MAX_SIDE} 像素之间`);
  }
  return info;
}

function sniff(b: Buffer): ImageInfo {
  // PNG: 89 50 4E 47 0D 0A 1A 0A, then the IHDR chunk with width/height
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (b.toString("latin1", 12, 16) !== "IHDR") throw new ImageError("PNG 文件已损坏");
    return { kind: "png", mime: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20), data: b };
  }
  // JPEG: FF D8 FF
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpeg(b);
  // WebP: "RIFF" <size> "WEBP"
  if (b.length > 30 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return webp(b);
  // ICO: reserved=0, type=1, count entries; browsers render it directly (common favicon format)
  if (b.length >= 6 && b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1) return ico(b);
  throw new ImageError("只支持 PNG、JPEG、WebP 或 ICO 图片（不支持 SVG、GIF 等格式）");
}

function ico(b: Buffer): ImageInfo {
  const count = b.readUInt16LE(4);
  if (count < 1 || count > 64) throw new ImageError("ICO 文件已损坏");
  if (b.length < 6 + count * 16) throw new ImageError("ICO 文件已损坏");
  let width = 0;
  let height = 0;
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const w = b[o] || 256;
    const h = b[o + 1] || 256;
    const size = b.readUInt32LE(o + 8);
    const offset = b.readUInt32LE(o + 12);
    if (size < 1 || offset < 6 + count * 16 || offset + size > b.length) throw new ImageError("ICO 文件已损坏");
    if (w * h > width * height) {
      width = w;
      height = h;
    }
  }
  if (!width || !height) throw new ImageError("ICO 文件缺少尺寸信息");
  return { kind: "ico", mime: "image/x-icon", width, height, data: b };
}

/** Walk JPEG segments: find the frame size, drop APP1 (EXIF/XMP) and other metadata segments. */
function jpeg(b: Buffer): ImageInfo {
  const kept: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  let width = 0;
  let height = 0;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new ImageError("JPEG 文件已损坏");
    const marker = b[i + 1];
    if (marker === 0xd9) break; // EOI before SOS: no image data
    if (marker === 0xda) {
      // start of scan: the rest is entropy-coded image data, keep as is
      kept.push(b.subarray(i));
      break;
    }
    if (i + 4 > b.length) throw new ImageError("JPEG 文件已损坏");
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) throw new ImageError("JPEG 文件已损坏");
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      height = b.readUInt16BE(i + 5);
      width = b.readUInt16BE(i + 7);
    }
    // APP1 (EXIF, XMP), APP13 (Photoshop/IPTC) and COM (comments) carry metadata, not pixels
    const metadata = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!metadata) kept.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  if (!width || !height) throw new ImageError("JPEG 文件缺少尺寸信息");
  return { kind: "jpg", mime: "image/jpeg", width, height, data: Buffer.concat(kept) };
}

function webp(b: Buffer): ImageInfo {
  const chunk = b.toString("latin1", 12, 16);
  let width = 0;
  let height = 0;
  if (chunk === "VP8 ") {
    // lossy: frame header after 3-byte tag + start code 9D 01 2A
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) throw new ImageError("WebP 文件已损坏");
    width = b.readUInt16LE(26) & 0x3fff;
    height = b.readUInt16LE(28) & 0x3fff;
  } else if (chunk === "VP8L") {
    if (b[20] !== 0x2f) throw new ImageError("WebP 文件已损坏");
    const bits = b.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >> 14) & 0x3fff) + 1;
  } else if (chunk === "VP8X") {
    width = 1 + b.readUIntLE(24, 3);
    height = 1 + b.readUIntLE(27, 3);
  } else {
    throw new ImageError("WebP 文件格式不受支持");
  }
  return { kind: "webp", mime: "image/webp", width, height, data: b };
}
