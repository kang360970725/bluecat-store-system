import { createHash, randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StoredTaskEvidence {
  objectKey: string;
  etag: string | null;
  checksumSha256: string;
}

@Injectable()
export class TaskEvidenceObjectStorage {
  private client?: S3Client;
  private bucket?: string;

  constructor(private readonly config: ConfigService) {}

  async put(image: Uint8Array): Promise<StoredTaskEvidence> {
    const { client, bucket } = this.connection();
    const now = new Date();
    const objectKey = [
      'task-evidence',
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.jpg`
    ].join('/');
    const checksumSha256 = createHash('sha256').update(image).digest('hex');
    try {
      const result = await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: image,
          ContentType: 'image/jpeg',
          ContentLength: image.byteLength,
          Metadata: { sha256: checksumSha256 }
        })
      );
      return {
        objectKey,
        etag: result.ETag?.replaceAll('"', '') ?? null,
        checksumSha256
      };
    } catch {
      throw new ServiceUnavailableException('照片存储暂不可用，请稍后重试');
    }
  }

  async get(objectKey: string, checksumSha256?: string | null) {
    const { client, bucket } = this.connection();
    try {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey })
      );
      if (!result.Body) throw new Error('Empty object body');
      const body = Buffer.from(await result.Body.transformToByteArray());
      if (
        checksumSha256 &&
        createHash('sha256').update(body).digest('hex') !== checksumSha256
      ) {
        throw new Error('Object checksum mismatch');
      }
      return body;
    } catch {
      throw new ServiceUnavailableException('照片读取失败，请稍后重试');
    }
  }

  async delete(objectKey: string) {
    const { client, bucket } = this.connection();
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })
      );
    } catch {
      throw new ServiceUnavailableException('照片清理失败，请稍后重试');
    }
  }

  private connection() {
    if (this.client && this.bucket)
      return { client: this.client, bucket: this.bucket };
    const endpoint = this.config.get<string>('S3_ENDPOINT')?.trim();
    const region = this.config.get<string>('AWS_DEFAULT_REGION')?.trim();
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = this.config
      .get<string>('AWS_SECRET_ACCESS_KEY')
      ?.trim();
    const bucket = this.config.get<string>('S3_PRIVATE_BUCKET')?.trim();
    if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) {
      throw new ServiceUnavailableException('照片存储尚未完成配置');
    }
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle:
        String(
          this.config.get<string>('S3_FORCE_PATH_STYLE') ?? 'true'
        ).toLowerCase() === 'true',
      credentials: { accessKeyId, secretAccessKey }
    });
    this.bucket = bucket;
    return { client: this.client, bucket: this.bucket };
  }
}
