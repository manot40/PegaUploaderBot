const { readdir, rename } = require("fs");
const { promisify } = require("util");
const readDir = promisify(readdir);
const mv = promisify(rename);
const puppeteer = require("puppeteer");
const cliProg = require("cli-progress");
const colors = require("colors");

// Custom Handler Lib
const { pastiin } = require("./inquirer");
const { logging } = require("./logger");
const config = require("../config");
const param = require("./parameter");

const progress = new cliProg.SingleBar({
  format: "Uploading |" + colors.grey("{bar}") + "| {percentage}% |",
  barCompleteChar: "\u2588",
  barIncompleteChar: "\u2591",
  hideCursor: true,
});

let browser;
async function startBrowser() {
  this.browser = await puppeteer.launch({ headless: config.silent });
  const page = await this.browser.newPage();
  const timeout = config.timeout * 1000;
  page.setViewport({ width: 1366, height: 768 });
  page.setDefaultTimeout(timeout);
  await page.goto(config.url);
  return page;
}

async function closeBrowser() {
  this.browser.close();
}

module.exports = {
  mulaiJob: async () => {
    try {
      const workFolder = config.folder + "/" + param.getJob(1) + "/";
      await readDir(workFolder, async (err, files) => {
        if (!files.length) {
          console.log("\x1b[31m", "FOLDER KOSONG!\n");
          console.log("\x1b[37m", "");
          process.exit();
        }

        let pegaGadget = 0;
        let resetCount = 1;
        console.log("\n");
        console.log("----------------");
        console.log("Total file: " + files.length);
        console.log("----------------\n");
        await pastiin();

        const page = await startBrowser();

        await page.click("#txtUserID");
        await page.click("#txtUserID");
        await page.keyboard.type(param.getAuth(0));
        await page.click("#txtPassword");
        await page.keyboard.type(param.getAuth(1));
        await page.click("#sub");
        await page.waitForTimeout("1500");

        try {
          await page.waitForSelector("#errorDiv", { timeout: 500 });
          closeBrowser();
          files.resetFotoBuatUpload();
          console.log(
            "\x1b[31m",
            "Password/Username salah cuk, masukin yang bener"
          );
          process.exit();
        } catch (err) {
          await page.waitForSelector(".menu-item-expand");
        }

        for (i = 0; i < files.length; i++) {
          const file = files[i];
          console.log(
            "-----------------------------------------------------------"
          );
          pegaGadget < 15 ? pegaGadget++ : (pegaGadget = 1);

          if (config.antiLag.enabled) {
            if (resetCount > config.antiLag.jobPerCycle) {
              resetCount = 1;
              console.log("Restarting to avoid lag...");
              await closeBrowser();
              return false;
            } else {
              resetCount++;
            }
          }

          console.log("File saat ini: " + file);
          progress.start(100, 0);
          progress.update(0);

          // Buka Menu Input Laporan
          await page.waitForSelector('li[title="Pengajuan"]');
          await page.click('li[title="Pengajuan"]');
          await page.waitForTimeout(100);
          await page.mouse.click(330, 50);
          await page.waitForTimeout("1500");
          progress.update(20);

          // Pilih Jenis pekerjaan untuk di input ke form laporan
          await page.waitForSelector('[id="PegaGadget' + pegaGadget + 'Ifr"]');
          const elementHandle = await page.$(
            'iframe[id="PegaGadget' + pegaGadget + 'Ifr"]'
          );
          const frame = await elementHandle.contentFrame();
          await frame.waitForSelector('[id="7fe8a912"]');
          await frame.select('[id="7fe8a912"]', param.getJob(0));
          await page.waitForTimeout(100);
          await frame.click('[title="Complete this assignment"]');
          progress.update(40);

          // Mengisi form laporan mitra berdasarkan jenis pekerjaan
          await frame.waitForSelector('input[id="2bc4e467"]');
          await frame.click('input[id="2bc4e467"]');
          config.customDesc.includes(param.getJob(0))
            ? await page.keyboard.type(file.slice(0, -4))
            : await page.keyboard.type(param.getJob(1));
          progress.update(60);
          await frame.waitForSelector(
            'input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]'
          );
          const uploadHandler = await frame.$(
            'input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]'
          );
          progress.update(70);
          await uploadHandler.uploadFile(workFolder + file);
          await frame
            .waitForSelector('div[node_name="pyCaseRelatedContentInner"]')
            .catch(async () => {
              await frame
                .waitForSelector('div[id="pega_ui_mask"]', { hidden: true })
                .catch();
            });
          await page.waitForTimeout(1000);
          progress.update(80);
          if (config.multiUpload.jobsID.includes(param.getJob(0))) {
            await page.waitForTimeout(1000);
            const laporanHandler = await frame.$(
              'input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]'
            );
            await laporanHandler.uploadFile(config.folder + "/laporan.xlsx");
            await page.waitForTimeout(5000);
            await frame
              .waitForSelector('div[id="pega_ui_mask"]', { hidden: true })
              .catch((err) => {
                page.waitForTimeout(3000);
              });
            progress.update(85);
          }
          await frame.click('[title="Complete this assignment"]');
          progress.update(90);
          await frame
            .waitForSelector('[node_name="pyConfirmMessage"]')
            .catch(async (e) => {
              await frame.click('[title="Complete this assignment"]').catch();
              await page.waitForTimeout(3000);
              await frame.waitForSelector('[node_name="pyConfirmMessage"]');
            });
          await page.waitForTimeout(1500);

          // Finishing job
          progress.update(100);
          progress.stop();
          await mv(
            workFolder + file,
            config.folder + "/trashBin/" + file
          ).catch((err) => {
            logging(err);
            console.warn(
              "File berhasil diupload, tapi gagal memindah ke trashBin"
            );
          });
          file !== files.slice(-1)
            ? console.log(
                "UPLOAD SUKSES! Sisa upload: " + files.getFotoLength()
              )
            : console.log(
                "UPLOAD SUKSES! Semua file terupload\n-----------------------------------------------------------"
              );
        }
        process.exit();
      });
    } catch (err) {
      logging(err);
      console.log("\x1b[31m", "FAILED!");
      console.log("\x1b[37m", "");
      try {
        closeBrowser();
      } catch (error) {
        console.log("\x1b[37m", "Error, Ulang dari awal");
        process.exit();
      }
      return false;
    }
  },
};
