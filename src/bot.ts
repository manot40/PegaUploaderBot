import kleur from 'kleur';
import store from './store';
import Progress from 'cli-progress';

import config, { type Config } from 'config';
import Puppeteer, { type Page, type Frame, type ElementHandle as El } from 'puppeteer-core';

const format = `Uploading: ${kleur.gray('{bar}')} {percentage}%`;
const sleep = (timeout = 1000) => new Promise((r) => setTimeout(r, timeout));

export default class Bot {
  private page: Page | undefined;
  private frame: Frame | undefined;
  private config: Config;

  public progress = new Progress.SingleBar({
    format,
    hideCursor: true,
    forceRedraw: true,
    stopOnComplete: true,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
  });

  constructor() {
    this.config = config;
  }

  private async startBrowser() {
    const browser = await Puppeteer.launch({
      headless: this.config.silent,
      executablePath: this.config.chromePath,
    });

    const page = await browser.newPage();
    page.setViewport({ width: 1366, height: 768 });
    page.on('dialog', (d) => d.dismiss());
    page.setDefaultTimeout(+this.config.timeout * 1000);

    await page.goto(this.config.url);
    return page;
  }

  private async reloadPage() {
    if (!this.page) throw new Error(NO_BROWSER);
    await this.page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });
    await sleep(2000);
  }

  private async retry(msg: string, cb: () => Promise<any>) {
    console.log('\n', msg, '\n');
    await this.reloadPage();
    return await cb();
  }

  public async reload() {
    await this.page!.browser().close();
    await sleep(1000);
    await this.login();
  }

  public async login() {
    try {
      this.page = await this.startBrowser();
      await sleep(1000);

      await this.page.click('#txtUserID');
      await this.page.click('#txtUserID');
      await this.page.keyboard.type(store.username);
      await sleep(1000);
      await this.page.click('#txtPassword');
      await this.page.keyboard.type(store.password);
      await this.page.click('#sub');
      await sleep(1500);
      try {
        await this.page.waitForSelector('#errorDiv', { timeout: 500 });
        console.log(kleur.red('Incorrect Password/Username'));
        console.log('Please Retry');
        return false;
      } catch {
        await this.page.waitForSelector('li[title="Pengajuan"]');
        await this.page.waitForNetworkIdle();
        await sleep(3000);
      }
    } catch (e: any) {
      return await this.retry(e.message, this.login);
    }
    return true;
  }

  public async beginInput() {
    if (!this.page) throw new Error(NO_BROWSER);
    try {
      this.progress.start(100, 0);
      await this.page.mouse.click(35, 80);
      await sleep(750);

      const menuItems = await this.page.$x("//a[span[contains(., 'BAS')]]");
      for (const item of menuItems as El<HTMLAnchorElement>[])
        if (!(await item.isHidden())) {
          await item.click();
          break;
        }

      this.progress.update(20);
    } catch (e: any) {
      await this.retry(e.message, this.beginInput);
    }
  }

  public async createForm(node: number) {
    try {
      if (!this.page) throw new Error(NO_BROWSER);
      if (!store.job) throw new Error(NO_JOB);

      const iframeEl = await this.page.waitForSelector(`iframe#PegaGadget${node}Ifr`);
      if (!iframeEl || !iframeEl.frame) throw new Error(`Iframe node ${node} not found`);
      this.frame = (await iframeEl!.contentFrame()) as Frame;

      const jobList = await this.frame.waitForSelector('select[name="$PpyWorkPage$pMitraActId"]');
      await jobList!.select(store.job.id);
      await this.frame.click('[title="Complete this assignment"]');

      try {
        await sleep(1000);
        await this.frame.waitForSelector('div.iconErrorDiv', { timeout: 1000 });
        console.log(kleur.red('Job Not Found. Retrying...'));
        await this.createForm(node);
      } catch {
        this.progress.update(40);
      }
    } catch (e: any) {
      await this.retry(e.messsage, () => this.createForm(node));
    }
  }

  public async handleForm(filePath: string) {
    try {
      if (!store.job) throw new Error(NO_JOB);
      if (!this.page) throw new Error(NO_BROWSER);
      if (!this.frame) throw new Error(NO_FRAME);

      const jobInput = await this.frame.waitForSelector('input[id="2bc4e467"]');
      if (!jobInput) throw new Error('Job input not found');

      const job = store.job;
      await jobInput.click();
      await this.page.keyboard.type(job.custom ? filePath.slice(0, -4) : job.name);

      this.progress.update(50);
    } catch (e: any) {
      await this.retry(e.messsage, () => this.handleForm(filePath));
    }
  }

  public async uploadFile(filePath: string) {
    try {
      if (!this.frame) throw new Error(NO_FRAME);
      const upload = await this.frame.waitForSelector<'input'>(
        'input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]' as any,
      );
      if (!upload) throw new Error('Upload input not found');
      await upload.uploadFile(`./${this.config.folder}/.temp/` + filePath);
      this.progress.update(70);

      await this.frame.waitForSelector('div#pega_ui_mask', { hidden: true }).catch(() => null);

      await sleep(750);
      const finishBtn = await this.frame.waitForSelector('button[title="Complete this assignment"]');
      await sleep(750);
      await finishBtn!.click();
      this.progress.update(90);
    } catch (e: any) {
      await this.retry(e.messsage, () => this.uploadFile(filePath));
    }
  }

  public async finishing() {
    if (!this.page) throw new Error(NO_BROWSER);
    if (!this.frame) throw new Error(NO_FRAME);
    try {
      await this.frame.waitForSelector('[title="Complete this assignment"]', { hidden: true });
      await sleep(2000);
      this.progress.update(100);
    } catch (e: any) {
      await this.retry(e.messsage, this.finishing);
    }
  }
}

const NO_JOB = 'Job not initialized yet, Please choose a job first!';
const NO_FRAME = 'PegaGadget Iframe not Initialized!';
const NO_BROWSER = 'Browser not initialized yet, Please login first!';
