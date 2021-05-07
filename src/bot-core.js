const puppeteer = require('puppeteer');

// Custom Handler Lib
const files = require('./files');
const appcfg = require('../config');
const param = require('./parameter');

async function startBrowser() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    page.setViewport({ width: 1366, height: 768 });
    await page.goto(appcfg.url);
    return { browser, page };
}

module.exports = {
    mulaiJob: async () => {
        const { browser, page } = await startBrowser();
        try {
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
            for (i = 0; i < files.getFotoLength(); i++) {
                pegaGadget < 15 ? pegaGadget++ : pegaGadget = 1;

                const foto = files.getFotoBuatUpload(i);
                console.log('\x1b[37m', 'Progress ' + (i + 1) + ' dari ' + files.getFotoLength() + ' | ' + foto);

                // Buka Menu Input Laporan
                await page.click('.menu-item-expand');
                await page.waitForTimeout(100);
                await page.mouse.click(330, 50);
                await page.waitForTimeout('4500');

                // Pilih Jenis pekerjaan untuk di input ke form laporan
                await page.waitForSelector('[id="PegaGadget' + pegaGadget + 'Ifr"]');
                const elementHandle = await page.$('iframe[id="PegaGadget' + pegaGadget + 'Ifr"]');
                const frame = await elementHandle.contentFrame();
                await frame.waitForSelector('[id="7fe8a912"]');
                await frame.select('[id="7fe8a912"]', param.getJob(0));
                await page.waitForTimeout(100);
                await frame.click('[title="Complete this assignment"]');

                // Mengisi form laporan mitra berdasarkan jenis pekerjaan
                await frame.waitForSelector('a[name="InputFinishActivity_pyWorkPage_25"]');
                await frame.click('input[id="2bc4e467"]');
                appcfg.customDesc ? await page.keyboard.type(foto.slice(0,-4)) : await page.keyboard.type(param.getJob(1));
                await frame.click('a[name="InputFinishActivity_pyWorkPage_25"]');
                await page.waitForTimeout(1000);
                const uploadHandler = await frame.$('input[type="file"]');
                uploadHandler.uploadFile(appcfg.folder + '/' + param.getJob(1) + '/' + foto + '/');
				if (appcfg.multiUpload.jobsID.includes(param.getJob(0))) {
                    await page.waitForTimeout(1000);
                    const laporanHandler = await frame.$('input[type="file"]');
                    await laporanHandler.uploadFile(appcfg.folder + '/laporan.xlsx');
                    await page.waitForTimeout(1500);
                }
                await page.waitForTimeout(1500);
                await frame.click('button[id="ModalButtonSubmit"]');
                await frame.waitForSelector('[class="attachment-thumbnail-wrapper"]');
                await frame.click('[title="Complete this assignment"]');
                await frame.waitForSelector('[node_name="pyConfirmMessage"]');
				await page.waitForTimeout(1500);

                // Finishing job
                files.moveComplete(appcfg.folder + '/' + param.getJob(1) + '/' + foto + '/', appcfg.folder + '/trashBin/' + foto + '/');
                files.remFotoGagal(foto);
                console.log('\x1b[32m', 'SUCCESS!')
            }
        } catch (err) {
            await files.logging(err);
            files.getSisaFoto();
            files.resetFotoBuatUpload();
            browser.close();
            return false;
        }
        console.log('\x1b[32m', 'SEMUA JOB SELESAI DIKERJAKAN!');
        process.exit();
    }
};