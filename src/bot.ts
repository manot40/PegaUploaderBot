import * as p from '@clack/prompts';
import path from 'path';
import { UniportApiClient, type ActivityItem, type UserContextOption } from './api';
import { color } from './color';
import { extractApiError, formatErrorMessage, isVerbose, logError } from './error';
import {
  compressImage,
  ensureDirectories,
  moveToTrash,
  sanitizeActivityName,
  scanActivityDirectory,
  stripExtension,
} from './files';
import { checkNetwork, LicenseManager } from './license';

export type KeteranganMode = 'activity' | 'filename';

export interface BotOptions {
  client?: UniportApiClient;
  license?: LicenseManager;
  prompts?: typeof p;
  env?: NodeJS.ProcessEnv;
  checkNetworkFn?: typeof checkNetwork;
  logErrorFn?: typeof logError;
  exitFn?: (code: number) => never | void;
}

export class MainBot {
  public readonly client: UniportApiClient;
  public readonly license: LicenseManager;

  private readonly ui: typeof p;
  private readonly env: NodeJS.ProcessEnv;
  private readonly checkNetworkFn: typeof checkNetwork;
  private readonly logErrorFn: typeof logError;
  private readonly exitFn: (code: number) => never | void;
  private readonly spinner: ReturnType<typeof p.spinner>;

  public currentUser = '';
  public usingCachedSession = false;

  constructor(options: BotOptions = {}) {
    this.license = options.license ?? new LicenseManager();
    this.client = options.client ?? new UniportApiClient();
    this.ui = options.prompts ?? p;
    this.env = options.env ?? process.env;
    this.checkNetworkFn = options.checkNetworkFn ?? checkNetwork;
    this.logErrorFn = options.logErrorFn ?? logError;
    this.exitFn = options.exitFn ?? ((code: number) => process.exit(code));
    this.spinner = this.ui.spinner();

    // Automatically persist refreshed or newly logged-in sessions to PocketBase
    const existingHook = this.client.onSessionUpdate;
    this.client.onSessionUpdate = async (event) => {
      if (existingHook) {
        await existingHook(event);
      }
      await this.license.saveSession(event.username, event.token, event.cookies).catch(this.logErrorFn);
    };
  }

  async run(): Promise<void> {
    this.ui.intro(`${color.cyan('Bot Mitra')}${isVerbose(process.argv, this.env) ? color.yellow(' [Verbose]') : ''}`);

    await this.verifyStartup();
    const userContexts = await this.authenticateAndFetchContext();
    const selectedCtx = await this.selectUserContext(userContexts);
    const activities = await this.prepareActivities(selectedCtx);
    await this.runBatchLoop(selectedCtx, activities);

    this.ui.outro(color.green('Semua antrian pekerjaan selesai!'));
  }

  async verifyStartup(): Promise<void> {
    this.spinner.start('Memeriksa koneksi jaringan...');
    try {
      await this.checkNetworkFn();
      this.spinner.stop('Koneksi jaringan terhubung.');
    } catch (err: unknown) {
      this.spinner.stop(color.red('Gagal terhubung ke jaringan.'));
      await this.logErrorFn(err);
      this.ui.cancel(formatErrorMessage(err));
      this.exitFn(1);
      return;
    }

    this.spinner.start('Memverifikasi versi bot...');
    try {
      const lic = await this.license.verify();
      if (!lic) {
        this.spinner.stop(color.yellow('Versi bot tidak diketahui.'));
      } else {
        this.spinner.stop(`Versi Bot: ${lic.version} | Status: ${color.green(lic.name || 'Aktif')}`);
      }
    } catch (err: unknown) {
      this.spinner.stop(color.red('Gagal verifikasi lisensi.'));
      await this.logErrorFn(err);
      this.ui.cancel(formatErrorMessage(err));
      this.exitFn(2);
    }
  }

  async authenticateAndFetchContext(): Promise<UserContextOption[]> {
    const envUser = this.env.BOT_USERNAME?.trim();
    const envPass = this.env.BOT_PASSWORD?.trim();

    let authenticated = false;

    if (envUser) {
      authenticated = await this.tryAuthenticateFromEnv(envUser, envPass);
    }

    while (!authenticated) {
      authenticated = await this.promptInteractiveAuth();
    }

    return this.fetchUserContextWithFallback();
  }

  private async tryAuthenticateFromEnv(envUser: string, envPass?: string): Promise<boolean> {
    if (this.license.isActive) {
      this.spinner.start(`Memeriksa sesi login tersimpan untuk ${color.yellow(envUser)}...`);
      try {
        const cached = await this.license.getValidSession(envUser);
        if (cached) {
          this.client.restoreSession(cached.token, cached.cookies);
          this.spinner.stop(`Login otomatis berhasil menggunakan sesi tersimpan sebagai ${color.green(envUser)}.`);
          this.currentUser = envUser;
          this.usingCachedSession = true;
          return true;
        }
        this.spinner.stop(color.yellow('Sesi tersimpan kedaluwarsa atau tidak ditemukan.'));
      } catch (err: unknown) {
        await this.logErrorFn(err);
        this.spinner.stop(color.yellow('Gagal memeriksa sesi tersimpan.'));
      }
    }

    if (envPass) {
      this.spinner.start(`Mencoba login otomatis sebagai ${color.yellow(envUser)}...`);
      try {
        await this.client.login(envUser, envPass);
        this.spinner.stop(`Login otomatis berhasil sebagai ${color.green(envUser)}.`);
        this.currentUser = envUser;
        this.usingCachedSession = false;
        return true;
      } catch (err: unknown) {
        await this.logErrorFn(err);
        this.spinner.stop(color.yellow('Kredensial dari .env tidak valid. Beralih ke input manual.'));
        if (isVerbose(process.argv, this.env)) {
          this.ui.log.error(formatErrorMessage(err));
        }
      }
    }

    return false;
  }

  private async promptInteractiveAuth(): Promise<boolean> {
    const username = await this.ui.text({
      message: 'Masukkan Email / Username:',
      placeholder: 'user@example.com',
      validate(value) {
        if (!value || !value.trim()) return 'Email / Username tidak boleh kosong!';
      },
    });
    if (this.ui.isCancel(username)) {
      this.ui.cancel('Operasi dibatalkan oleh pengguna.');
      this.exitFn(0);
      return false;
    }
    const email = username.trim();

    if (this.license.isActive) {
      try {
        const cached = await this.license.getValidSession(email);
        if (cached) {
          this.client.restoreSession(cached.token, cached.cookies);
          this.ui.log.success(`Sesi sebelumnya ditemukan! Login otomatis sebagai ${color.green(email)}.`);
          this.currentUser = email;
          this.usingCachedSession = true;
          return true;
        }
      } catch (err: unknown) {
        await this.logErrorFn(err);
      }
    }

    return this.promptPasswordAndLogin(
      email,
      'Masukkan Password:',
      'Silakan coba masukkan email dan password kembali.',
    );
  }

  private async promptPasswordAndLogin(
    email: string,
    promptMessage: string,
    retryHintMessage: string,
  ): Promise<boolean> {
    const password = await this.ui.password({
      message: promptMessage,
      validate(value) {
        if (!value) return 'Password tidak boleh kosong!';
      },
    });
    if (this.ui.isCancel(password)) {
      this.ui.cancel('Operasi dibatalkan oleh pengguna.');
      this.exitFn(0);
      return false;
    }

    this.spinner.start('Mengautentikasi ke Uniport...');
    try {
      await this.client.login(email, password);
      this.spinner.stop(color.green('Login berhasil!'));
      this.currentUser = email;
      this.usingCachedSession = false;
      return true;
    } catch (err: unknown) {
      await this.logErrorFn(err);
      this.spinner.stop(color.red('Login gagal.'));
      this.ui.log.error(formatErrorMessage(err));
      this.ui.log.warn(retryHintMessage);
      return false;
    }
  }

  private async fetchUserContextWithFallback(): Promise<UserContextOption[]> {
    this.spinner.start('Mengambil konteks pengguna...');
    try {
      const contexts = await this.client.getUserContext();
      this.spinner.stop('Konteks pengguna berhasil diambil.');
      return contexts;
    } catch (err: unknown) {
      const apiError = extractApiError(err);
      if (this.usingCachedSession && apiError?.status === 401) {
        this.spinner.stop(color.yellow('Sesi tersimpan sudah kedaluwarsa di server. Silakan masukkan password.'));

        while (true) {
          const loggedIn = await this.promptPasswordAndLogin(
            this.currentUser,
            `Masukkan Password untuk ${this.currentUser}:`,
            'Silakan coba masukkan password kembali.',
          );
          if (!loggedIn) continue;

          this.spinner.start('Mengambil konteks pengguna...');
          try {
            const contexts = await this.client.getUserContext();
            this.spinner.stop('Konteks pengguna berhasil diambil.');
            return contexts;
          } catch (ctxErr: unknown) {
            await this.logErrorFn(ctxErr);
            this.spinner.stop(color.red('Gagal mengambil konteks pengguna.'));
            this.ui.cancel(formatErrorMessage(ctxErr));
            this.exitFn(1);
            return [];
          }
        }
      }

      this.spinner.stop(color.red('Gagal mengambil konteks pengguna.'));
      await this.logErrorFn(err);
      this.ui.cancel(formatErrorMessage(err));
      this.exitFn(1);
      return [];
    }
  }

  async selectUserContext(userContexts: UserContextOption[]): Promise<UserContextOption> {
    if (userContexts.length === 0) {
      this.ui.cancel('Tidak ditemukan opsi konteks organisasi untuk akun ini.');
      this.exitFn(1);
      return undefined as never;
    }

    if (userContexts.length === 1) {
      return userContexts[0];
    }

    const ctxChoice = await this.ui.select({
      message: 'Pilih konteks divisi/departemen:',
      options: userContexts.map((ctx) => ({
        value: ctx,
        label: `${ctx.pyCompany} - Divisi: ${ctx.divisionCode || ctx.divisionId}, Dept: ${ctx.departmentCode || ctx.departmentId}, Seksi: ${ctx.sectionCode || ctx.sectionId}`,
      })),
    });

    if (this.ui.isCancel(ctxChoice)) {
      this.ui.cancel('Operasi dibatalkan.');
      this.exitFn(0);
      return undefined as never;
    }

    return ctxChoice;
  }

  async prepareActivities(selectedCtx: UserContextOption): Promise<ActivityItem[]> {
    this.spinner.start('Mengambil daftar aktivitas Mitra...');
    let activities: ActivityItem[] = [];
    try {
      activities = await this.client.getActivities(selectedCtx);
      this.spinner.stop(`Ditemukan ${activities.length} aktivitas.`);
    } catch (err: unknown) {
      this.spinner.stop(color.red('Gagal mengambil daftar aktivitas.'));
      await this.logErrorFn(err);
      this.ui.cancel(formatErrorMessage(err));
      this.exitFn(1);
      return [];
    }

    if (activities.length === 0) {
      this.ui.cancel('Tidak ada aktivitas yang tersedia untuk konteks ini.');
      this.exitFn(1);
      return [];
    }

    this.spinner.start('Menyelaraskan folder penyimpanan...');
    await ensureDirectories(activities.map((a) => a.activityName));
    this.spinner.stop("Folder aktivitas siap di folder 'images/'.");

    return activities;
  }

  async runBatchLoop(selectedCtx: UserContextOption, activities: ActivityItem[]): Promise<void> {
    let keepRunning = true;
    while (keepRunning) {
      const activityChoices = await Promise.all(
        activities.map(async (act) => {
          const files = await scanActivityDirectory(act.activityName);
          return {
            value: act,
            label: `[${files.length} berkas] ${act.activityName}`,
          };
        }),
      );

      const chosenAct = await this.ui.select({
        message: 'Pilih aktivitas yang akan diunggah:',
        options: activityChoices,
      });

      if (this.ui.isCancel(chosenAct)) {
        break;
      }

      const filesInDir = await this.waitForActivityFiles(chosenAct.activityName);
      if (filesInDir.length === 0) {
        continue;
      }

      const keteranganMode = await this.ui.select({
        message: 'Pilih mode keterangan untuk berkas:',
        options: [
          {
            value: 'activity' as const,
            label: `Gunakan nama aktivitas ("${chosenAct.activityName}")`,
          },
          {
            value: 'filename' as const,
            label: 'Gunakan nama berkas asli (tanpa ekstensi)',
          },
        ],
        initialValue: 'activity' as const,
      });

      if (this.ui.isCancel(keteranganMode)) {
        continue;
      }

      const startConfirm = await this.ui.confirm({
        message: `Siap mengunggah ${filesInDir.length} berkas untuk aktivitas '${chosenAct.activityName}'?`,
        initialValue: true,
      });

      if (this.ui.isCancel(startConfirm) || !startConfirm) {
        this.ui.log.info('Batch dibatalkan. Kembali ke menu aktivitas.');
        continue;
      }

      await this.executeBatch(selectedCtx, chosenAct, filesInDir, keteranganMode);

      const loopChoice = await this.ui.confirm({
        message: 'Ingin mengunggah aktivitas lain?',
        initialValue: false,
      });

      if (this.ui.isCancel(loopChoice) || !loopChoice) {
        keepRunning = false;
      }
    }
  }

  private async waitForActivityFiles(activityName: string): Promise<string[]> {
    let filesInDir = await scanActivityDirectory(activityName);

    while (filesInDir.length === 0) {
      const safeDirName = sanitizeActivityName(activityName);
      this.ui.log.warn(`Folder 'images/${safeDirName}' masih kosong.`);

      const rescan = await this.ui.confirm({
        message: 'Ingin menaruh berkas ke folder sekarang dan memuat ulang?',
        initialValue: true,
      });

      if (this.ui.isCancel(rescan) || !rescan) {
        break;
      }

      filesInDir = await scanActivityDirectory(activityName);
    }

    return filesInDir;
  }

  async executeBatch(
    selectedCtx: UserContextOption,
    chosenAct: ActivityItem,
    filesInDir: string[],
    keteranganMode: KeteranganMode,
  ): Promise<{ successCount: number; failCount: number }> {
    const safeDirName = sanitizeActivityName(chosenAct.activityName);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < filesInDir.length; i++) {
      const fileName = filesInDir[i];
      const filePath = path.join('images', safeDirName, fileName);
      const fileIndexStr = `(${i + 1}/${filesInDir.length})`;
      const keterangan = keteranganMode === 'filename' ? stripExtension(fileName) : chosenAct.activityName;

      this.spinner.start(`${fileIndexStr} Mengompres & mengunggah '${fileName}'...`);

      try {
        const { blob } = await compressImage(filePath);
        await this.client.uploadSingleFile(selectedCtx, chosenAct.id, keterangan, blob, fileName);

        await moveToTrash(filePath);
        successCount++;
        this.spinner.stop(`${color.green(`${fileIndexStr} Berhasil diunggah:`)} ${fileName}`);
      } catch (err: unknown) {
        failCount++;
        await this.logErrorFn(err);
        const errMsg = err instanceof Error ? err.message : String(err);
        this.spinner.stop(`${color.red(`${fileIndexStr} Gagal diunggah:`)} ${fileName} - ${errMsg}`);
        if (isVerbose(process.argv, this.env)) {
          const apiErr = extractApiError(err);
          if (apiErr && apiErr.payload) {
            this.ui.log.error(`${color.yellow('[Detail API]:')} ${apiErr.payload}`);
          }
        }
        this.ui.log.warn(`Berkas '${fileName}' tetap tersimpan untuk diunggah ulang nanti.`);
      }
    }

    this.ui.log.message(
      `${color.cyan('Laporan Antrian:')} ${color.green(`${successCount} sukses`)}, ${color.red(`${failCount} gagal`)}.`,
    );

    await this.license.sendTelemetry(this.currentUser, chosenAct.activityName, successCount).catch(this.logErrorFn);

    return { successCount, failCount };
  }
}
