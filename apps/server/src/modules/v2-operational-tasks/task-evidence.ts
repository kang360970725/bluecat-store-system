import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export const maxEvidenceFiles = 3;
export const maxEvidenceFileSize = 5 * 1024 * 1024;

export async function encodeTaskEvidence(input: Buffer) {
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000 });
    const { format, pages } = await image.metadata();
    if (
      !format ||
      !['jpeg', 'png', 'webp'].includes(format) ||
      (pages ?? 1) > 1
    ) {
      throw new Error('Unsupported image');
    }
    const jpeg = await image
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82 })
      .toBuffer();
    if (jpeg.length > 1024 * 1024) throw new Error('Encoded image too large');
    return Uint8Array.from(jpeg);
  } catch {
    throw new BadRequestException(
      '照片无法处理，请选用清晰的 JPG、PNG 或 WebP 图片'
    );
  }
}
