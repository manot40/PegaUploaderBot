import type { Config } from 'config';

import store from './store';
import colors from 'colors';
import Progress from 'cli-progress';

import Puppeteer, { type Page, type Frame, type ElementHandle as El } from 'puppeteer-core';

const progress = new Progress.SingleBar({
  format: 'Uploading |' + colors.grey('{bar}') + '| {percentage}% |',
  hideCursor: true,
  forceRedraw: true,
  stopOnComplete: true,
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
});

const sleep = (timeout = 1000) => new Promise((r) => setTimeout(r, timeout));

export default class Bot {
  private page: Page | undefined;
  private frame: Frame | undefined;
  private config: Config;

  private node: number;
  private file: string;

  constructor(config: Config) {
    this.node = 0;
    this.file = '';
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
    if (!this.page) throw new Error('Browser not initialized yet, Please login first!');
    await this.page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });
    await sleep(2000);
  }

  private async retry(msg: string, cb: () => Promise<any>) {
    console.log('\n', msg, '\n');
    await this.reloadPage();
    return await cb();
  }

  public setNode(i: number) {
    this.node = i;
  }

  public setFile(i: string) {
    this.file = i;
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
      await this.page.keyboard.type(store.getUsername());
      await sleep(1000);
      await this.page.click('#txtPassword');
      await this.page.keyboard.type(store.getPassword());
      await this.page.click('#sub');
      await sleep(1500);
      try {
        await this.page.waitForSelector('#errorDiv', { timeout: 500 });
        console.log('\x1b[31m', 'Incorrect Password/Username');
        console.log('\x1b[37m', 'Please Retry');
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
    if (!this.page) throw new Error('Browser not initialized yet, Please login first!');
    try {
      progress.start(100, 0);
      await this.page.mouse.click(35, 80);
      await sleep(750);

      // await this.page.mouse.click(40, 160);
      // await sleep(1000);

      const menuItems = await this.page.$x("//a[span[contains(., 'BAS')]]");
      for (const item of menuItems as El<HTMLAnchorElement>[])
        if (!(await item.isHidden())) {
          await item.click();
          break;
        }

      progress.update(20);
    } catch (e: any) {
      await this.retry(e.message, this.beginInput);
    }
  }

  public async createForm() {
    if (!this.page) throw new Error('Browser not initialized yet, Please login first!');
    try {
      const iframeEl = await this.page.waitForSelector(`iframe#PegaGadget${this.node}Ifr`);
      if (!iframeEl || !iframeEl.frame) throw new Error(`Gadget node ${this.node} not found`);
      this.frame = (await iframeEl!.contentFrame()) as Frame;

      const jobList = await this.frame.waitForSelector('select[id="7fe8a912"]');
      await jobList!.select(store.getJob(0));
      await this.frame.click('[title="Complete this assignment"]');

      try {
        await sleep(1000);
        await this.frame.waitForSelector('div.iconErrorDiv', { timeout: 1000 });
        console.log('\x1b[31m', 'Job Not Found. Retrying...');
        await this.createForm();
      } catch {
        progress.update(40);
      }
    } catch (e: any) {
      await this.retry(e.messsage, this.createForm);
    }
  }

  public async handleForm() {
    if (!this.page) throw new Error('Browser not initialized yet, Please login first!');
    if (!this.frame) throw new Error('PegaGadget Iframe not Initialized!');
    try {
      const jobInput = await this.frame.waitForSelector('input[id="2bc4e467"]');
      if (!jobInput) throw new Error('Job input not found');

      await jobInput.click();
      this.config.customDesc.includes(store.getJob(0))
        ? await this.page.keyboard.type(this.file.slice(0, -4))
        : await this.page.keyboard.type(store.getJob(1));

      progress.update(50);
    } catch (e: any) {
      await this.retry(e.messsage, this.handleForm);
    }
  }

  public async uploadFile() {
    if (!this.frame) throw new Error('PegaGadget Iframe not Initialized!');
    try {
      const upload = await this.frame.waitForSelector<'input'>(
        'input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]' as any,
      );
      if (!upload) throw new Error('Upload input not found');
      await upload.uploadFile(`./${this.config.folder}/.temp/` + this.file);
      progress.update(70);

      try {
        await this.frame.waitForSelector('i[title="No Items"]', { hidden: true, timeout: 30000 });
      } catch {
        await this.frame.waitForSelector('div#pega_ui_mask', { hidden: true }).catch(() => null);
      }

      await sleep(750);
      const finishBtn = await this.frame.waitForSelector('button[title="Complete this assignment"]');
      await sleep(750);
      await finishBtn!.click();
      progress.update(90);
    } catch (e: any) {
      await this.retry(e.messsage, this.uploadFile);
    }
  }

  public async finishing() {
    if (!this.page) throw new Error('Browser not initialized yet, Please login first!');
    if (!this.frame) throw new Error('PegaGadget Iframe not Initialized!');
    try {
      await this.frame.waitForSelector('[title="Complete this assignment"]', { hidden: true });
      await sleep(2000);
      progress.update(100);
    } catch (e: any) {
      await this.retry(e.messsage, this.finishing);
    }
  }
}
