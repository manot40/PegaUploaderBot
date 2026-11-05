import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import {
  compressImage,
  ensureDirectories,
  isSupportedImage,
  moveToTrash,
  sanitizeActivityName,
  scanActivityDirectory,
  stripExtension,
} from '../src/files';

const TEST_DIR = path.join(process.cwd(), 'test_images_tmp');

describe('File Handler & Image Pipeline', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should sanitize activity names and strip extensions', () => {
    expect(sanitizeActivityName('Layanan / IT & Ops\\Network:Special')).toBe('Layanan IT & Ops Network Special');
    expect(stripExtension('foto_kerja.jpg')).toBe('foto_kerja');
    expect(stripExtension('laporan_akhir.backup.png')).toBe('laporan_akhir.backup');
  });

  it('should accurately filter supported image formats and ignore system/hidden files', () => {
    expect(isSupportedImage('photo.jpg')).toBe(true);
    expect(isSupportedImage('photo.JPEG')).toBe(true);
    expect(isSupportedImage('photo.png')).toBe(true);
    expect(isSupportedImage('photo.webp')).toBe(true);
    expect(isSupportedImage('photo.heic')).toBe(true);
    expect(isSupportedImage('photo.avif')).toBe(true);

    expect(isSupportedImage('.DS_Store')).toBe(false);
    expect(isSupportedImage('.gitkeep')).toBe(false);
    expect(isSupportedImage('Thumbs.db')).toBe(false);
    expect(isSupportedImage('thumbs.db')).toBe(false);
    expect(isSupportedImage('document.pdf')).toBe(false);
    expect(isSupportedImage('notes.txt')).toBe(false);
  });

  it('should ensure directories and scan activity directories correctly', async () => {
    const actName = 'Job/Activity 1';
    await ensureDirectories([actName], TEST_DIR);

    const safeName = sanitizeActivityName(actName);
    const targetDir = path.join(TEST_DIR, safeName);

    await fs.writeFile(path.join(targetDir, 'img1.png'), 'dummy-png');
    await fs.writeFile(path.join(targetDir, 'img2.jpg'), 'dummy-jpg');
    await fs.writeFile(path.join(targetDir, 'ignore.txt'), 'dummy-txt');
    await fs.writeFile(path.join(targetDir, 'Thumbs.db'), 'dummy-db');

    const files = await scanActivityDirectory(actName, TEST_DIR);
    expect(files.sort()).toEqual(['img1.png', 'img2.jpg']);
  });

  it('should compress images <= 1920px without downscaling', async () => {
    // Create a 800x600 test image using Bun.Image
    const smallImagePath = path.join(TEST_DIR, 'small.png');
    // Generate 1x1 image and resize to 800x600
    const rawPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await fs.writeFile(smallImagePath, new Uint8Array(rawPng));

    // Resize to 800x600 png
    await Bun.file(smallImagePath).image().resize(800, 600).png().write(smallImagePath);

    const result = await compressImage(smallImagePath);
    expect(result.originalWidth).toBe(800);
    expect(result.compressedWidth).toBe(800);
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('should compress images > 1920px down to width / 4', async () => {
    const largeImagePath = path.join(TEST_DIR, 'large.png');
    const rawPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await fs.writeFile(largeImagePath, new Uint8Array(rawPng));

    // Resize to 2400x1600 png
    await Bun.file(largeImagePath).image().resize(2400, 1600).png().write(largeImagePath);

    const result = await compressImage(largeImagePath);
    expect(result.originalWidth).toBe(2400);
    expect(result.compressedWidth).toBe(600); // 2400 / 4
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('should move uploaded files to trash and handle overwrites', async () => {
    const trashDir = path.join(TEST_DIR, 'trash');
    const fileToUpload = path.join(TEST_DIR, 'done_photo.jpg');
    await fs.writeFile(fileToUpload, 'first-content');

    const movedPath = await moveToTrash(fileToUpload, trashDir);
    expect(await Bun.file(movedPath).text()).toBe('first-content');
    expect(await Bun.file(fileToUpload).exists()).toBe(false);

    // Overwrite test
    await fs.writeFile(fileToUpload, 'second-content');
    const movedPath2 = await moveToTrash(fileToUpload, trashDir);
    expect(await Bun.file(movedPath2).text()).toBe('second-content');
  });
});
