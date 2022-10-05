import store from "./store";
import { prompt } from "inquirer";

export default async (jobs, fastLogin) => {
  if (fastLogin.enabled) {
    console.log("\x1b[31m", "Fast Login Active");
    store.setAuth(fastLogin.username, fastLogin.password);
    console.log("\x1b[37m", `Logged in as: ${fastLogin.username}\n`);
  } else {
    await prompt(login);
  }

  await prompt({
    name: "job",
    type: "list",
    message: "Choose job to be uploaded:",
    choices: jobs,
  }).then((result) => {
    let res = JSON.stringify(result);
    const jobId = parseInt(res.slice(9, 13), 10) - 0;
    store.setJob([jobId.toString(), res.slice(15, -2)]);
  });
};

export const confirm = async (len) => {
  await prompt(makeSure(len)).then((res) => {
    if (!res.sure) {
      console.log("Okay, take your time.");
      process.exit(0);
    }
  });
};

const login = [
  {
    name: "username",
    type: "input",
    message: "Username:",
    validate: function (value) {
      if (value.length) {
        store.setUsername(value);
        return true;
      } else {
        return "Masukin username yang bener jancok.";
      }
    },
  },
  {
    name: "password",
    type: "password",
    message: "Password:",
    validate: function (value) {
      if (value.length) {
        store.setPassword(value);
        return true;
      } else {
        return "Masukin password yang bener jancok.";
      }
    },
  },
];
const makeSure = (total) => ({
  name: "sure",
  type: "confirm",
  message: `${total} file(s) found. All good? (Enter)`,
  default: true,
});
