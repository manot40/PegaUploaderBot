let username, password, job;

module.exports = {
  setAuth: (uname, psswd) => {
    username = uname;
    password = psswd;
  },
  setUsername: (uname) => {
    username = uname;
  },
  setPassword: (psswd) => {
    password = psswd;
  },
  setJob: (obj) => {
    job = obj;
  },
  getAuth: (i) => {
    auth = [username, password];
    return auth[i];
  },
  getJob: (i) => {
    return job[i];
  },
};
