import config, { jobs, fastLogin, folder } from "../config";
import input, { confirm } from "./input";
import Uploads from "./uploads";
import figlet from "figlet";
import store from "./store";
import clear from "clear";
import chalk from "chalk";
import Bot from "./bot";

clear();
console.log(
  chalk.green(figlet.textSync(config.jobName, { horizontalLayout: "full" }))
);
console.log("\n Ver: 2.0.0-Alpha \n");

export default async function () {
  let pegaGadget = 0;
  let resetCounter = 0;

  await input(jobs, fastLogin);
  const workDir = await Uploads(folder, store.getJob(1));
  await confirm();
  const bot = await Bot(config);
  await bot.login();

  // Begin uploading tasks
  for (let file of workDir.uploads) {
    if (config.antiLag.enabled) {
      if (resetCounter > config.antiLag.jobPerCycle) {
        resetCounter = 0;
        console.log("Reloading to avoid lag...");
        await bot.reloadPage();
        await bot.idleState(2000);
      } else {
        resetCounter++;
      }
    }

    if (await workDir.compressUpload(file)) {
      pegaGadget < 15 ? pegaGadget++ : (pegaGadget = 1);
      console.log("----------------------------------------------------------");
      console.log("File saat ini: " + file);
      await bot.setNode(pegaGadget);
      await bot.beginInput();
      await bot.createForm();
      await bot.handleForm();
      await bot.finishing();
      await workDir.uploadDone();
      console.log("----------------------------------------------------------");
    } else {
      console.log("\x1b[31m", "File cannot be compressed!");
      console.log("\x1b[37m", "This entry will be skipped");
    }
  }
}
