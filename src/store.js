let username, password, job;

const store = {
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
  getUsername: () => {
    return username;
  },
  getPassword: () => {
    return password;
  },
  getJob: (i) => {
    return job[i];
  },
};

export default store;
