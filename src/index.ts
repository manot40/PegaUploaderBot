import * as p from '@clack/prompts';
import fs from 'fs/promises';
import path from 'path';
import { color } from './color';
import { MitraApiClient, type UserContextOption } from './api';
import { extractApiError, formatErrorMessage, isVerbose } from './error';
import {
  compressImage,
  ensureDirectories,
  moveToTrash,
  sanitizeActivityName,
  scanActivityDirectory,
  stripExtension,
} from './files';
import { checkLicense, checkNetwork, sendTelemetry } from './license';

function logError(error: unknown) {
  const apiError = extractApiError(error);
  let message: string;
  if (apiError && apiError.payload) {
    message = `${apiError.stack || apiError.message}\nPayload API (${apiError.endpoint || 'unknown'} - HTTP ${apiError.status}): ${apiError.payload}`;
  } else if (error instanceof Error) {
    message = error.stack || error.message;
  } else {
    message = String(error);
  }
  const logLine = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFile('error.log', logLine, 'utf8').catch(() => {});
}

process.on('unhandledRejection', logError);
process.on('uncaughtException', logError);

export async function main() {
  p.intro(`${color.cyan('Bot Mitra')}${isVerbose() ? color.yellow(' [Verbose]') : ''}`);

  const s = p.spinner();

  // 1. Startup Checks
  s.start('Memeriksa koneksi jaringan...');
  try {
    await checkNetwork();
    s.stop('Koneksi jaringan terhubung.');
  } catch (err: unknown) {
    s.stop(color.red('Gagal terhubung ke jaringan.'));
    logError(err);
    p.cancel(formatErrorMessage(err));
    process.exit(1);
  }

  s.start('Memverifikasi versi bot...');
  let lic: Awaited<ReturnType<typeof checkLicense>>;
  try {
    lic = await checkLicense();
    if (!lic) s.stop(color.yellow('Versi bot tidak diketahui.'));
    else s.stop(`Versi Bot: ${lic.version} | Status: ${color.green(lic.name || 'Aktif')}`);
  } catch (err: unknown) {
    s.stop(color.red('Gagal verifikasi lisensi.'));
    logError(err);
    p.cancel(formatErrorMessage(err));
    process.exit(2);
  }

  // 2. Client & Authentication
  const client = new MitraApiClient();
  let authenticated = false;
  let currentUser = '';

  const envUser = process.env.BOT_USERNAME?.trim();
  const envPass = process.env.BOT_PASSWORD?.trim();

  if (envUser && envPass) {
    s.start(`Mencoba login otomatis sebagai ${color.yellow(envUser)}...`);
    try {
      await client.login(envUser, envPass);
      s.stop(`Login otomatis berhasil sebagai ${color.green(envUser)}.`);
      authenticated = true;
      currentUser = envUser;
    } catch (err: unknown) {
      logError(err);
      s.stop(color.yellow('Kredensial dari .env tidak valid. Beralih ke input manual.'));
      if (isVerbose()) {
        p.log.error(formatErrorMessage(err));
      }
    }
  }

  while (!authenticated) {
    const username = await p.text({
      message: 'Masukkan Email / Username:',
      placeholder: 'user@example.com',
      validate(value) {
        if (!value || !value.trim()) return 'Email / Username tidak boleh kosong!';
      },
    });
    if (p.isCancel(username)) {
      p.cancel('Operasi dibatalkan oleh pengguna.');
      process.exit(0);
    }

    const password = await p.password({
      message: 'Masukkan Password:',
      validate(value) {
        if (!value) return 'Password tidak boleh kosong!';
      },
    });
    if (p.isCancel(password)) {
      p.cancel('Operasi dibatalkan oleh pengguna.');
      process.exit(0);
    }

    s.start('Mengautentikasi ke Uniport...');
    try {
      await client.login(username.trim(), password);
      s.stop(color.green('Login berhasil!'));
      authenticated = true;
      currentUser = username.trim();
    } catch (err: unknown) {
      logError(err);
      s.stop(color.red('Login gagal.'));
      p.log.error(formatErrorMessage(err));
      p.log.warn('Silakan coba masukkan email dan password kembali.');
    }
  }

  // 3. User Context Resolution
  s.start('Mengambil konteks pengguna...');
  let userContexts: UserContextOption[] = [];
  try {
    userContexts = await client.getUserContext();
    s.stop('Konteks pengguna berhasil diambil.');
  } catch (err: unknown) {
    s.stop(color.red('Gagal mengambil konteks pengguna.'));
    logError(err);
    p.cancel(formatErrorMessage(err));
    process.exit(1);
  }

  let selectedCtx: UserContextOption;
  if (userContexts.length === 0) {
    p.cancel('Tidak ditemukan opsi konteks organisasi untuk akun ini.');
    process.exit(1);
  } else if (userContexts.length === 1) {
    selectedCtx = userContexts[0];
  } else {
    const ctxChoice = await p.select({
      message: 'Pilih konteks divisi/departemen:',
      options: userContexts.map((ctx, idx) => ({
        value: ctx,
        label: `${ctx.pyCompany} - Divisi: ${ctx.divisionCode || ctx.divisionId}, Dept: ${ctx.departmentCode || ctx.departmentId}, Seksi: ${ctx.sectionCode || ctx.sectionId}`,
      })),
    });
    if (p.isCancel(ctxChoice)) {
      p.cancel('Operasi dibatalkan.');
      process.exit(0);
    }
    selectedCtx = ctxChoice;
  }

  // 4. Fetch Activities & Ensure Directories
  s.start('Mengambil daftar aktivitas Mitra...');
  let activities: { id: number; activityName: string }[] = [];
  try {
    activities = await client.getActivities(selectedCtx);
    s.stop(`Ditemukan ${activities.length} aktivitas.`);
  } catch (err: unknown) {
    s.stop(color.red('Gagal mengambil daftar aktivitas.'));
    logError(err);
    p.cancel(formatErrorMessage(err));
    process.exit(1);
  }

  if (activities.length === 0) {
    p.cancel('Tidak ada aktivitas yang tersedia untuk konteks ini.');
    process.exit(1);
  }

  s.start('Menyelaraskan folder penyimpanan...');
  await ensureDirectories(activities.map((a) => a.activityName));
  s.stop("Folder aktivitas siap di folder 'images/'.");

  // 5. Multi-Batch Execution Loop
  let keepRunning = true;
  while (keepRunning) {
    // Scan folder counts for each activity
    const activityChoices = await Promise.all(
      activities.map(async (act) => {
        const files = await scanActivityDirectory(act.activityName);
        return {
          value: act,
          label: `[${files.length} berkas] ${act.activityName}`,
          fileCount: files.length,
        };
      }),
    );

    const chosenAct = await p.select({
      message: 'Pilih aktivitas yang akan diunggah:',
      options: activityChoices.map((c) => ({
        value: c.value,
        label: c.label,
      })),
    });

    if (p.isCancel(chosenAct)) {
      break;
    }

    let filesInDir = await scanActivityDirectory(chosenAct.activityName);

    // Empty folder handling with re-scan option
    while (filesInDir.length === 0) {
      const safeDirName = sanitizeActivityName(chosenAct.activityName);
      p.log.warn(`Folder 'images/${safeDirName}' masih kosong.`);

      const rescan = await p.confirm({
        message: 'Ingin menaruh berkas ke folder sekarang dan memuat ulang?',
        initialValue: true,
      });

      if (p.isCancel(rescan) || !rescan) {
        break;
      }

      filesInDir = await scanActivityDirectory(chosenAct.activityName);
    }

    if (filesInDir.length === 0) {
      continue;
    }

    // Single prompt for keterangan mode before executing batch
    const keteranganMode = await p.select({
      message: 'Pilih mode keterangan untuk berkas:',
      options: [
        {
          value: 'activity',
          label: `Gunakan nama aktivitas ("${chosenAct.activityName}")`,
        },
        {
          value: 'filename',
          label: 'Gunakan nama berkas asli (tanpa ekstensi)',
        },
      ],
      initialValue: 'activity',
    });

    if (p.isCancel(keteranganMode)) {
      continue;
    }

    const startConfirm = await p.confirm({
      message: `Siap mengunggah ${filesInDir.length} berkas untuk aktivitas '${chosenAct.activityName}'?`,
      initialValue: true,
    });

    if (p.isCancel(startConfirm) || !startConfirm) {
      p.log.info('Batch dibatalkan. Kembali ke menu aktivitas.');
      continue;
    }

    // Sequential Upload Loop
    const safeDirName = sanitizeActivityName(chosenAct.activityName);
    let remaining = filesInDir.length;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < filesInDir.length; i++) {
      const fileName = filesInDir[i];
      const filePath = path.join('images', safeDirName, fileName);
      const fileIndexStr = `(${i + 1}/${filesInDir.length})`;

      const keterangan = keteranganMode === 'filename' ? stripExtension(fileName) : chosenAct.activityName;

      s.start(`${fileIndexStr} Mengompres & mengunggah '${fileName}'...`);

      try {
        const { blob } = await compressImage(filePath);
        await client.uploadSingleFile(selectedCtx, chosenAct.id, keterangan, blob, fileName);

        await moveToTrash(filePath);
        successCount++;
        remaining--;
        s.stop(`${color.green(`${fileIndexStr} Berhasil diunggah:`)} ${fileName}`);
      } catch (err: unknown) {
        failCount++;
        logError(err);
        const errMsg = err instanceof Error ? err.message : String(err);
        s.stop(`${color.red(`${fileIndexStr} Gagal diunggah:`)} ${fileName} - ${errMsg}`);
        if (isVerbose()) {
          const apiErr = extractApiError(err);
          if (apiErr && apiErr.payload) {
            p.log.error(`${color.yellow('[Detail API]:')} ${apiErr.payload}`);
          }
        }
        p.log.warn(`Berkas '${fileName}' tetap tersimpan untuk diunggah ulang nanti.`);
      }
    }

    p.log.message(
      `${color.cyan('Laporan Antrian:')} ${color.green(`${successCount} sukses`)}, ${color.red(`${failCount} gagal`)}.`,
    );

    if (lic?.active && lic.token) {
      await sendTelemetry(
        { user: currentUser, job_name: chosenAct.activityName, job_count: successCount },
        { token: lic.token },
      ).catch(logError);
    }

    // Multi-batch prompt
    const loopChoice = await p.confirm({
      message: 'Ingin mengunggah aktivitas lain?',
      initialValue: false,
    });

    if (p.isCancel(loopChoice) || !loopChoice) {
      keepRunning = false;
    }
  }

  p.outro(color.green('Semua antrian pekerjaan selesai!'));
}

if (import.meta.main) {
  main().catch((err) => {
    logError(err);
    p.cancel(formatErrorMessage(err));
    process.exit(1);
  });
}
