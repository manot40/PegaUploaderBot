const fs = require('fs');
var util = require('util');
const config = require('../config');

var fotoUpload = [];
var fotoGagal = [];
let date_ob = new Date();

module.exports = {
  checkFotoBuatUpload: (folder) => {
    fs.readdir(config.folder + '/' + folder + '/', (err, files) => {
      if(files.length) {
        files.forEach(file => {
          fotoUpload.push(file);
        });
        console.log('\n');
        fotoGagal = fotoUpload.slice(0);
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

  getSisaFoto: () => {
    console.log('\x1b[31m', 'FAILED!');
    console.log('Sisa yang belum diupload:');
    for (i = 0; i < fotoGagal.length; i++) {
      console.log(fotoGagal[i]);
    }
  },

  getFotoLength: () => {
    return fotoUpload.length;
  },

  remFotoGagal: (i) => {
    var deletion = [];
    deletion.push(i);
    fotoGagal = fotoGagal.filter(item => !deletion.includes(item))
  },

  resetFotoBuatUpload: () => {
    fotoUpload = [];
    fotoGagal = [];
  },

  logging: (i) => {
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let hours = ("0" + date_ob.getHours()).slice(-2);
    let minutes = ("0" + date_ob.getMinutes()).slice(-2);

    var writer = fs.createWriteStream('./log/puppeteer-bot/error.log', { flags: 'a' });
    writer.write(util.format(date + '/' + month + '/' + year + ' ' + hours + ':' + minutes + ' | Caught exception: ' + i) + '\n');
  },

  moveComplete: (currPath, destPath) => {
    fs.rename(currPath, destPath, function (err) {
      if (err) {
        console.log(err);
      } else {
        //console.log('File dipindahkan');
      }
    })
  }
};