const inquirer = require('inquirer');
const Configstore = require('configstore');
const pkg = require('../package.json');

const cfgstore = new Configstore(pkg.name);
const appcfg = require('../config');

// Files Handler Lib
const files  = require('./files');

module.exports = {
  cobaLogin: () => {
    const questions = [
      {
        name: 'username',
        type: 'input',
        message: 'Username:',
        validate: function( value ) {
          if (value.length) {
            cfgstore.set('username', value);
            return true;
          } else {
            return 'Masukin username yang bener jancok.';
          }
        }
      },
      {
        name: 'password',
        type: 'password',
        message: 'Password:',
        validate: function(value) {
          if (value.length) {
            cfgstore.set('password', value);
            return true;
          } else {
            return 'Masukin password yang bener jancok.';
          }
        }
      }
    ];
    return inquirer.prompt(questions);
  },

  pilihJob: () => {
    const questions = [
      {
        name: 'job',
        type: 'list',
        message: 'Pilih Job yang mau dikerjain:',
        choices: appcfg.jobs,
      },
    ];
    return inquirer.prompt(questions).then((answer) => {
      let val = JSON.stringify(answer);
      const jobID = parseInt(val.slice(9,13), 10)-0;
      cfgstore.set('job', jobID.toString());
      cfgstore.set('job-desc', val.slice(15,-2));
    });
  },

  pastiin: () => {
	files.checkFotoBuatUpload(cfgstore.get('job-desc'));
	const questions = [
	  {
		name: 'sure',
		type: 'confirm',
		message: 'Udah lengkap? (Enter)',
		default: true,
	  },
	];
	return inquirer.prompt(questions);
  },

  loginSkip: () => {
    console.log('\x1b[31m', 'Fast Login Active');
    cfgstore.set('username', appcfg.fastLogin.username);
    cfgstore.set('password', appcfg.fastLogin.password);
    console.log('\x1b[37m', 'Logged in as: ' + cfgstore.get('username') + '\n');
  },
};