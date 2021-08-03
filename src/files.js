const fs = require('fs');
var util = require('util');
const config = require('../config');

var fotoUpload = [];
let date_ob = new Date();

module.exports = {
  checkFotoBuatUpload: (folder) => {
    fs.readdir(config.folder + '/' + folder + '/', (err, files) => {
      if(files.length) {
        files.forEach(file => {
          fotoUpload.push(file);
        });
        console.log('\n');
        console.log('----------------');
        console.log('Total file: ' + fotoUpload.length);
        console.log('----------------\n');
      } else {
        console.log('\x1b[31m', 'FOLDER KOSONG!\n');
		process.exit();
      }
    });
  },

  getFotoBuatUpload: (i) => {
    return fotoUpload[i].toString();
  },

  getFotoLength: () => {
    return fotoUpload.length;
  },

  logging: (i) => {
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let hours = ("0" + date_ob.getHours()).slice(-2);
    let minutes = ("0" + date_ob.getMinutes()).slice(-2);

    var writer = fs.createWriteStream('./log/puppeteer-bot/error.log', { flags: 'a' });
    writer.write(util.format('[' + date + '/' + month + '/' + year + ' ' + hours + ':' + minutes + '] ' + i) + '\n');
  },

  fotoDone: (currPath, destPath) => {
	fotoUpload.shift();
    fs.rename(currPath, destPath, function (err) {
      if (err) {
        console.log(err);
      } else {
        //console.log('File dipindahkan');
      }
    })
  }
};