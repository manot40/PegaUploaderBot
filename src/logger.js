const { createWriteStream } = require('fs');
const { format } = require('util');

let date_ob = new Date();

module.exports = {
  logging: (i) => {
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let hours = ("0" + date_ob.getHours()).slice(-2);
    let minutes = ("0" + date_ob.getMinutes()).slice(-2);

    var writer = createWriteStream('./log/puppeteer-bot/error.log', { flags: 'a' });
    writer.write(format('[' + date + '/' + month + '/' + year + ' ' + hours + ':' + minutes + '] ' + i) + '\n');
  },
};