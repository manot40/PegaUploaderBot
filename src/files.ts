import fs from 'fs/promises';
import path from 'path';

export const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.avif', '.bmp', '.tiff']);

export function sanitizeActivityName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripExtension(fileName: string): string {
  const ext = path.extname(fileName);
  return fileName.slice(0, fileName.length - ext.length).trim();
}

export function isSupportedImage(fileName: string): boolean {
  if (fileName.startsWith('.') || fileName.toLowerCase() === 'thumbs.db') {
    return false;
  }
  const ext = path.extname(fileName).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export async function ensureDirectories(activityNames: string[], baseDir = 'images'): Promise<void> {
  const trashDir = path.join(baseDir, 'trash');
  await fs.mkdir(trashDir, { recursive: true });

  for (const name of activityNames) {
    const safeName = sanitizeActivityName(name);
    if (safeName) {
      await fs.mkdir(path.join(baseDir, safeName), { recursive: true });
    }
  }
}

export async function scanActivityDirectory(activityName: string, baseDir = 'images'): Promise<string[]> {
  const safeName = sanitizeActivityName(activityName);
  const targetDir = path.join(baseDir, safeName);

  try {
    const entries = await fs.readdir(targetDir);
    return entries.filter(isSupportedImage);
  } catch {
    return [];
  }
}

export interface CompressedImageResult {
  blob: Blob;
  originalWidth: number;
  compressedWidth: number;
}

export async function compressImage(filePath: string): Promise<CompressedImageResult> {
  const file = Bun.file(filePath);
  const img = file.image();
  const meta = await img.metadata();
  const width = meta.width;

  if (width > 1920) {
    const targetWidth = Math.round(width / 4);
    const blob = await img.resize(targetWidth).jpeg({ quality: 75 }).blob();
    return { blob, originalWidth: width, compressedWidth: targetWidth };
  }

  const blob = await img.jpeg({ quality: 60 }).blob();
  return { blob, originalWidth: width, compressedWidth: width };
}

export async function moveToTrash(filePath: string, trashDir = 'images/trash'): Promise<string> {
  await fs.mkdir(trashDir, { recursive: true });
  const fileName = path.basename(filePath);
  const destination = path.join(trashDir, fileName);

  try {
    // Attempt rename directly
    await fs.rename(filePath, destination);
  } catch (err: unknown) {
    // If destination already exists or cross-device, remove destination and copy/unlink
    const isExdev = (err as { code?: string })?.code === 'EXDEV';
    await fs.unlink(destination).catch(() => {});
    if (isExdev) {
      await fs.copyFile(filePath, destination);
      await fs.unlink(filePath);
    } else {
      await fs.rename(filePath, destination);
    }
  }

  return destination;
}
