const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');

const config = require('./config');
var n = 0;

async function askFolder() {
  const question = [
    {
      name: 'job',
      type: 'list',
      message: 'Pilih Job yang mau dikerjain:',
      choices: config.jobs,
    },
  ];
  let val;
  await inquirer.prompt(question).then((answer) => {
    val = JSON.stringify(answer);
  });
  return val.slice(15, -2);
}

async function askNumber() {
  const question = [
    {
      type: 'input',
      name: 'n',
      message: 'Masukin nomor start:',
      validate: function (value) {
        if (isNaN(value)) { return 'Harus berformat angka!' }
        else { return true }
      },
    },
  ];
  await inquirer.prompt(question).then((answer) => {
    n = answer.n;
  });
}

async function renameBatch() {
  console.log('Bulk file rename to sorted code numbering');

  const workFolder = config.folder + '/' + await askFolder() + '/';
  await askNumber();
  
  fs.readdir(workFolder, (err, files) => {
    if (!files.length) {
      console.log('\x1b[31m', 'FOLDER KOSONG!\n');
	  console.log('\x1b[37m', '');
      process.exit();
    }
    files.forEach(file => {
      fs.rename(workFolder + file, workFolder + n + path.extname(file), function (err) {
        if(err) { console.log(err) }
      })
      console.log('Renamed ' + file + ' to ' + n + path.extname(file))
      n++
    });
    console.log('DONE');
  });
}

renameBatch();