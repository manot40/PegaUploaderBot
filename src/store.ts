let username: string, password: string, job: string[];

const store = {
  setAuth: (uname: string, psswd: string) => {
    username = uname;
    password = psswd;
  },
  setUsername: (uname: string) => {
    username = uname;
  },
  setPassword: (psswd: string) => {
    password = psswd;
  },
  setJob: (obj: string[]) => {
    job = obj;
  },
  getUsername: () => {
    return username;
  },
  getPassword: () => {
    return password;
  },
  getJob: (i: number) => {
    return job[i];
  },
};

export default store;
