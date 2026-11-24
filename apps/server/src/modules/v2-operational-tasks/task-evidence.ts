import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export const maxEvidenceFiles = 12;
export const maxLegacyEvidenceFiles = 3;
export const maxEvidenceFileSize = 5 * 1024 * 1024;
export const maxRawEvidenceTotalSize = 24 * 1024 * 1024;
export const maxEncodedEvidenceFileSize = 768 * 1024;
export const maxEncodedEvidenceTotalSize = 9 * 1024 * 1024;

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
    const { data: jpeg, info } = await image
      .rotate()
      .resize(1440, 1440, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (jpeg.length > maxEncodedEvidenceFileSize)
      throw new Error('Encoded image too large');
    return {
      image: Uint8Array.from(jpeg),
      byteSize: jpeg.length,
      width: info.width,
      height: info.height
    };
  } catch {
    throw new BadRequestException(
      '照片无法处理，请选用清晰的 JPG、PNG 或 WebP 图片'
    );
  }
}
