const puppeteer = require('puppeteer');
const cliProg = require('cli-progress');
const colors = require('colors');

// Custom Handler Lib
const files = require('./files');
const appcfg = require('../config');
const param = require('./parameter');

const progress = new cliProg.SingleBar({
    format: 'Uploading |' + colors.grey('{bar}') + '| {percentage}% |',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
});

async function startBrowser() {
    const browser = await puppeteer.launch({ headless: appcfg.silent });
    const page = await browser.newPage();
    const timeout = appcfg.timeout*1000;
    page.setViewport({ width: 1366, height: 768 });
    page.setDefaultTimeout(timeout);
    await page.goto(appcfg.url);
    return { browser, page };
}

module.exports = {
    mulaiJob: async () => {
        await startBrowser()
            .then(async ({browser, page}) => {
                await page.click('#txtUserID');
                await page.click('#txtUserID');
                await page.keyboard.type(param.getAuth(0));
                await page.click('#txtPassword');
                await page.keyboard.type(param.getAuth(1));
                await page.click('#sub');
                await page.waitForTimeout('1500');
                try {
                    await page.waitForSelector('#errorDiv', { timeout: 500 });
                    browser.close();
                    files.resetFotoBuatUpload();
                    console.log('\x1b[31m', 'Password/Username salah cuk, masukin yang bener')
                    return false;
                } catch (err) {
                    await page.waitForSelector('.menu-item-expand');
                }
                let pegaGadget = 0;
                const totalFoto = files.getFotoLength();
                for (i = 0; i < totalFoto; i++) {
                    const foto = files.getFotoBuatUpload(0);
                    pegaGadget < 15 ? pegaGadget++ : pegaGadget = 1;
                    
                    console.log('-----------------------------------------------------------');
                    console.log('File saat ini: ' + foto);
                    progress.start(100, 0);
                    progress.update(0);

                    // Buka Menu Input Laporan
                    await page.waitForSelector('li[title="Pengajuan"]');
                    await page.click('li[title="Pengajuan"]');
                    await page.waitForTimeout(100);
                    await page.mouse.click(330, 50);
                    await page.waitForTimeout('1500');
                    progress.update(20);

                    // Pilih Jenis pekerjaan untuk di input ke form laporan
                    await page.waitForSelector('[id="PegaGadget' + pegaGadget + 'Ifr"]');
                    const elementHandle = await page.$('iframe[id="PegaGadget' + pegaGadget + 'Ifr"]');
                    const frame = await elementHandle.contentFrame();
                    await frame.waitForSelector('[id="7fe8a912"]');
                    await frame.select('[id="7fe8a912"]', param.getJob(0));
                    await page.waitForTimeout(100);
                    await frame.click('[title="Complete this assignment"]');
                    progress.update(40);

                    // Mengisi form laporan mitra berdasarkan jenis pekerjaan
                    await frame.waitForSelector('input[id="2bc4e467"]');
                    await frame.click('input[id="2bc4e467"]');
                    appcfg.customDesc.includes(param.getJob(0)) ? await page.keyboard.type(foto.slice(0,-4)) : await page.keyboard.type(param.getJob(1));
                    progress.update(60);
                    await frame.waitForSelector('input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]');
                    const uploadHandler = await frame.$('input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]');
                    progress.update(70);
                    await uploadHandler.uploadFile(appcfg.folder + '/' + param.getJob(1) + '/' + foto + '/');
                    await frame.waitForSelector('div[node_name="pyCaseRelatedContentInner"]');
                    progress.update(80);
                    if (appcfg.multiUpload.jobsID.includes(param.getJob(0))) {
                        await page.waitForTimeout(1000);
                        const laporanHandler = await frame.$('input[name="$PpyWorkPage$pFileSupport$ppxResults$l1$ppyLabel"]');
                        await laporanHandler.uploadFile(appcfg.folder + '/laporan.xlsx');
                        await page.waitForTimeout(5000)
                        await frame.waitForSelector('div[id="pega_ui_mask"]', {hidden: true}).catch(err => {page.waitForTimeout(3000)});
                        progress.update(85);
                    }
                    await frame.click('[title="Complete this assignment"]');
                    progress.update(90);
                    await frame.waitForSelector('[node_name="pyConfirmMessage"]').catch(e => {
                        frame.click('[title="Complete this assignment"]').catch(console.log('Looks like its lagging...'));
                        page.waitForTimeout(3000);
                        frame.waitForSelector('[node_name="pyConfirmMessage"]');
                    });
                    await page.waitForTimeout(1500);

                    // Finishing job
                    progress.update(100);
                    progress.stop();
                    files.fotoDone(appcfg.folder + '/' + param.getJob(1) + '/' + foto + '/', appcfg.folder + '/trashBin/' + foto + '/');
                    files.getFotoLength() > 0 ? console.log('UPLOAD SUKSES! Sisa upload: ' + files.getFotoLength()) : console.log('UPLOAD SUKSES! Semua file terupload\n-----------------------------------------------------------');
                }
                console.log('\x1b[32m', '\nJOB SELESAI');
                process.exit();
            })
            .catch((error) => {
                console.log('\x1b[31m', 'FAILED!');
                files.logging(error);
                return false;
            })
    }
};