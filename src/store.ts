import { createNanoEvents } from 'nanoevents';

type StoreEvent = Omit<typeof event, 'emit'>;
const event = createNanoEvents<{
  jobChange: (store: Store) => void;
  credChange: (store: Store) => void;
}>();

export interface Job {
  id: string;
  name: string;
  custom?: boolean;
}

export class Store {
  public job: Job | null = null;
  public username = '';
  public password = '';

  public event = event as StoreEvent;

  public setJob(job: Job) {
    this.job = job;
    event.emit('jobChange', this);
    return this;
  }

  public setUsername(username: string) {
    this.username = username;
    event.emit('credChange', this);
    return this;
  }

  public setPassword(password: string) {
    this.password = password;
    event.emit('credChange', this);
    return this;
  }
}

export default new Store();
