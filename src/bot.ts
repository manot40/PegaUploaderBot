import type { Page, Frame, ElementHandle as El, Browser } from 'puppeteer-core';

import kleur from 'kleur';
import store from './store';
import Progress from 'cli-progress';

import config_, { type Config } from 'config';
import Puppeteer from 'puppeteer-core';

const format = `Uploading: ${kleur.gray('{bar}')} {percentage}%`;
const sleep = (timeout = 1000) => new Promise((r) => setTimeout(r, timeout));

class Bot {
  protected page: Page | undefined;
  protected browser: Browser | undefined;
  protected progress = new Progress.SingleBar({
    format,
    hideCursor: true,
    forceRedraw: true,
    stopOnComplete: true,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
  });

  constructor(public config = Object.freeze(config_) as Readonly<Config>) {}

  protected async startBrowser() {
    const browser = (this.browser = await Puppeteer.launch({
      headless: this.config.silent,
      executablePath: this.config.chromePath,
    }));

    const page = (this.page = (await browser.pages())[0]);
    page.setViewport({ width: 1366, height: 768 });
    page.on('dialog', (d) => d.dismiss());
    page.setDefaultTimeout(+this.config.timeout * 1000);

    await page.goto(this.config.url);
    return [page, browser] as const;
  }

  protected async reloadPage() {
    if (!this.page) throw new Error(NO_BROWSER);
    await this.page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });
    await sleep(2000);
  }

  protected async clearError(err: Error, cb: () => Promise<void>) {
    const message = process.env.NODE_ENV === 'production' ? `${err.message}\n` : err;
    console.log('\n', message);
    await this.reloadPage();
    return await cb();
  }

  async reload() {
    await this.page?.browser().close();
    await sleep(1000);
    await this.login();
  }

  async login() {
    try {
      const [page] = await this.startBrowser();
      await sleep(1000);

      await page.click('#txtUserID');
      await page.click('#txtUserID');
      await page.keyboard.type(store.username);
      await sleep(1000);
      await page.click('#txtPassword');
      await page.keyboard.type(store.password);
      await page.click('#sub');
      await sleep(1500);
      try {
        await page.waitForSelector('#errorDiv', { timeout: 500 });
        console.log(kleur.red('Incorrect Password/Username'));
        console.log('Please Retry');
        return;
      } catch {
        await page.waitForSelector('li[title="Pengajuan"]');
        await page.waitForNetworkIdle();
      }
    } catch (e: any) {
      await this.clearError(e, this.login);
      return;
    }
  }

  protected async selectJob(target: Page | Frame) {
    if (!store.job) throw new Error(NO_JOB);

    const jobList = await target.waitForSelector('select[name="$PpyWorkPage$pMitraActId"]');
    await jobList!.select(store.job.id);
    await target.click('[title="Complete this assignment"]');

    try {
      await sleep(1000);
      await target.waitForSelector('div.iconErrorDiv', { timeout: 1000 });
      console.log(kleur.red('Job Not Found. Retrying...'));
      return { error: 'Cannot find matching job' };
    } catch {
      this.progress.update(40);
      return { error: null };
    }
  }

  protected async fillForm(target: Page | Frame, path: string) {
    const jobInput = await target.waitForSelector('input[id="2bc4e467"]');
    if (!jobInput) throw new Error('Job input not found');
    if (!store.job) throw new Error(NO_JOB);

    /* Fill Job and Description */
    const job = store.job;
    await jobInput.click();
    await this.page?.keyboard.type(job.custom ? path.slice(0, -4) : job.name);
    this.progress.update(50);

    /* Upload Work Image */
    const upload = await target.waitForSelector<'input'>(
      'input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]' as any,
    );
    if (!upload) throw new Error('Upload input not found');
    await upload.uploadFile(`./${this.config.folder}/.temp/` + path);
    this.progress.update(70);

    await target.waitForSelector('div#pega_ui_mask', { hidden: true }).catch(() => null);
    await sleep(750);

    /* Check if Upload Succeeded */
    const finishBtn = await target.waitForSelector('button[title="Complete this assignment"]');
    await sleep(750);
    await finishBtn!.click();
    this.progress.update(90);
  }

  protected async submitForm(target: Page | Frame) {
    await target.waitForSelector('[title="Complete this assignment"]', { hidden: true });
    await sleep(2000);
    this.progress.update(100);
  }
}

export class ClassicBot extends Bot {
  private frame: Frame | undefined;

  constructor(config?: Config) {
    super(config);
  }

  public async openForm() {
    if (!this.page) throw new Error(NO_BROWSER);
    try {
      this.progress.start(100, 0);
      await this.page.mouse.click(32, 60);
      await sleep(500);

      const menuItems = await this.page.$x("//a[span[contains(., 'NON BAS')]]");
      for (const item of menuItems as El<HTMLAnchorElement>[])
        if (!(await item.isHidden())) {
          await item.click();
          break;
        }

      this.progress.update(20);
    } catch (e: any) {
      await this.clearError(e, () => this.openForm());
    }
  }

  public async createIframe(node: number) {
    if (!this.page) throw new Error(NO_BROWSER);
    try {
      const iframeEl = await this.page.waitForSelector(`iframe#PegaGadget${node}Ifr`);
      if (!iframeEl || !iframeEl.frame) throw new Error(`Iframe node ${node} not found`);

      const frame = (this.frame = await iframeEl!.contentFrame());
      const { error } = await this.selectJob(frame);
      if (error) throw new Error(error);
    } catch (e: any) {
      await this.clearError(e.messsage, () => this.createIframe(node));
    }
  }

  public async handleForm(filePath: string) {
    if (!this.frame) throw new Error(NO_FRAME);
    try {
      await this.fillForm(this.frame, filePath);
    } catch (e: any) {
      await this.clearError(e.messsage, () => this.handleForm(filePath));
    }
  }

  public async finishing() {
    if (!this.frame) throw new Error(NO_FRAME);
    try {
      await this.submitForm(this.frame);
    } catch (e: any) {
      await this.clearError(e.messsage, this.finishing);
    }
  }
}

export class DirectBot extends Bot {
  private token: string | undefined;

  constructor(config?: Config) {
    super(config);
  }

  public async openForm() {
    if (!this.page) throw new Error(NO_BROWSER);

    const originUrl = new URL(this.page.url());
    const token = (this.token ||= originUrl.pathname.split('/').find((x) => x.trim().endsWith('*')));
    if (!token) throw new Error('Token not found');

    const formUrl = new URL(
      `${this.config.url}/app/HCC_/${token}/!TABTHREAD1?pyActivity=%40baseclass.doUIAction&action=createNewWork&className=ASM-HCC-Work-MitraActivity&flowName=pyStartCase&dynamicContainerID=e56cd577-8cca-4033-8c3d-92e7e040475c&contentID=926523c9-804f-e3e5-a21d-b15afe5a0580&portalThreadName=STANDARD&portalName=Mitra`,
    );

    await this.page.goto(formUrl.href);
    await this.page.waitForNetworkIdle();
    await this.selectJob(this.page);
  }

  public async handleForm(filePath: string) {
    if (!this.page) throw new Error(NO_BROWSER);
    try {
      await this.fillForm(this.page, filePath);
    } catch (e: any) {
      await this.clearError(e.messsage, () => this.handleForm(filePath));
    }
  }

  public async finishing() {
    if (!this.page) throw new Error(NO_BROWSER);
    try {
      await this.submitForm(this.page);
    } catch (e: any) {
      await this.clearError(e.messsage, this.finishing);
    }
  }
}

const NO_JOB = 'Job not initialized yet, Please choose a job first!';
const NO_FRAME = 'PegaGadget Iframe not Initialized!';
const NO_BROWSER = 'Browser not initialized yet, Please login first!';
