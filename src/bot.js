import cliProgress from 'cli-progress';
import Puppeteer from 'puppeteer-core';
import colors from 'colors';
import store from './store';

const progress = new cliProgress.SingleBar({
  format: 'Uploading |' + colors.grey('{bar}') + '| {percentage}% |',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
});

const sleep = (timeout = 1000) => new Promise((r) => setTimeout(r, timeout));

async function bot(config) {
  const { page } = await startBrowser(config);
  const temp = `./${config.folder}/.temp/`;

  /** @type {import('puppeteer-core').Frame} */
  let frame, node;

  const reloadPage = async () => page.reload({ waitUntil: 'networkidle0' });

  async function retry(msg, cb) {
    console.error(msg);
    await reloadPage();
    return await cb();
  }

  return {
    sleep,
    setNode: (i) => (node = i),
    reloadPage,

    async login() {
      try {
        await page.click('#txtUserID');
        await page.click('#txtUserID');
        await page.keyboard.type(store.getUsername());
        await page.click('#txtPassword');
        await page.keyboard.type(store.getPassword());
        await page.click('#sub');
        await sleep(1500);
        try {
          await page.waitForSelector('#errorDiv', { timeout: 500 });
          console.log('\x1b[31m', 'Incorrect Password/Username');
          console.log('\x1b[37m', 'Please Retry');
          return false;
        } catch {
          await page.waitForSelector('li[title="Pengajuan"]');
          await page.waitForNetworkIdle();
          await sleep(3000);
        }
      } catch ({ message }) {
        return await retry(message, this.login);
      }
      return true;
    },

    async beginInput() {
      try {
        progress.start(100, 0);
        await page.mouse.click(10, 10);
        await sleep(750);

        // Click Pengajuan
        const start = await page.$$('a[role="menuitem"]');
        await start[4].click();
        await sleep(750);
        await page.mouse.click(10, 10);
        await sleep(1000);
        progress.update(20);
      } catch ({ message }) {
        await retry(message, this.beginInput);
      }
    },

    async createForm() {
      try {
        await page.waitForSelector(`[id="PegaGadget${node}Ifr"]`);
        const iframeEl = await page.$(`iframe[id="PegaGadget${node}Ifr"]`);
        frame = await iframeEl.contentFrame();

        await frame.waitForSelector('[id="12f20963"]');
        await frame.select('[id="7fe8a912"]', store.getJob(0));
        await frame.click('[title="Complete this assignment"]');

        try {
          await frame.waitForSelector('div.iconErrorDiv', { timeout: 1500 });
          console.log('\x1b[31m', 'Job Not Found. Retrying...');
          await this.createForm();
        } catch {
          progress.update(40);
        }
      } catch ({ message }) {
        await retry(message, this.createForm);
      }
    },

    async handleForm(file) {
      try {
        const jobInput = await frame.waitForSelector('input[id="2bc4e467"]');
        await jobInput.click();
        config.customDesc.includes(store.getJob(0))
          ? await page.keyboard.type(file.slice(0, -4))
          : await page.keyboard.type(store.getJob(1));
        progress.update(50);
      } catch ({ message }) {
        await retry(message, this.handleForm);
      }
    },

    async uploadFile(file) {
      try {
        const upload = await frame.waitForSelector('input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]');
        progress.update(70);
        await upload.uploadFile(temp + file);

        try {
          await frame.waitForSelector('div[node_name="pyCaseRelatedContentInner"]');
        } catch {
          await frame.waitForSelector('div[id="pega_ui_mask"]', { hidden: true }).catch(() => {});
        }

        await sleep(1000);
        progress.update(90);
        await frame.click('[title="Complete this assignment"]');
      } catch ({ message }) {
        await retry(message, this.uploadFile);
      }
    },

    async finishing() {
      try {
        await sleep(8000);
        progress.update(100) || progress.stop();
      } catch ({ message }) {
        await retry(message, this.finishing);
      }
    },
  };
}

async function startBrowser(config) {
  const browser = await Puppeteer.launch({
    headless: config.silent,
    executablePath: config.chromePath,
  });
  const page = await browser.newPage();
  const timeout = config.timeout * 1000;
  page.setViewport({ width: 1366, height: 768 });
  page.on('dialog', async (d) => d.dismiss());
  page.setDefaultTimeout(timeout);
  await page.goto(config.url);
  return { browser, page };
}

export default bot;
