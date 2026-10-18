// Image storage: local disk (development) or Amazon S3 (production).
// S3 credentials are read by the AWS SDK from the standard environment
// variables (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) or an IAM role.
import crypto from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const uploadRoot = path.resolve(config.storage.uploadDir);

let s3 = null;
function s3Client() {
  const { region, bucket } = config.storage.s3;
  if (!region || !bucket) throw new Error('AWS_REGION and AWS_S3_BUCKET are required for STORAGE_DRIVER=s3');
  s3 ??= new S3Client({ region });
  return s3;
}

/** Checks the file's magic bytes so a renamed non-image can't be uploaded. */
function sniffImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.subarray(4, 12).toString('ascii').startsWith('ftypavi')) return 'image/avif';
  return null;
}

/**
 * Stores an uploaded image and returns its public URL and storage key.
 * @param {{ buffer: Buffer, mimetype: string }} file multer memory-storage file
 */
export async function saveImage(file, folder = 'products') {
  const type = sniffImageType(file.buffer);
  if (!type || !ALLOWED_IMAGE_TYPES[type]) throw badRequest('Only JPEG, PNG, WebP, GIF or AVIF images are allowed');
  const now = new Date();
  const key = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ALLOWED_IMAGE_TYPES[type]}`;

  if (config.storage.driver === 's3') {
    const { bucket, region, publicUrl } = config.storage.s3;
    await s3Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: type,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    const base = publicUrl?.replace(/\/$/, '') ?? `https://${bucket}.s3.${region}.amazonaws.com`;
    return { url: `${base}/${key}`, key };
  }

  const target = path.join(uploadRoot, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.buffer);
  return { url: `/uploads/${key}`, key };
}

/** Best-effort deletion of a stored image (used when images are removed from products). */
export async function deleteImage(key) {
  if (!key || key.includes('..')) return;
  try {
    if (config.storage.driver === 's3') {
      await s3Client().send(new DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }));
    } else {
      await unlink(path.join(uploadRoot, key));
    }
  } catch (err) {
    logger.warn({ err, key }, 'Could not delete stored image');
  }
}
