const fs = require('fs');
const conf = require('./config');
const { compress } = require('compress-images/promise');

const INPUT_path_to_your_images = conf.folder+'/mango/**/*.{jpg,JPG,jpeg,JPEG,png}';
const OUTPUT_path = conf.folder+'/compressed/mango/';

const processImages = async (onProgress) => {
    await compress({
        source: INPUT_path_to_your_images,
        destination: OUTPUT_path,
        onProgress,
        enginesSetup: {
            jpg: { engine: 'mozjpeg', command: ['-quality', '50'] },
            png: { engine: 'pngquant', command: ['--quality=20-50', '-o'] },
        }
    });
};

processImages((error, statistic) => {
    if (error) {
        console.log('Error happen while processing file');
        console.log(error);
        return;
    }

    fs.unlink(statistic.input, (err) => {
        if (err) throw err;
        console.log('Successfully compressed and deleted ' + statistic.input);
    });
});
