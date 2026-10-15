import { AsyncLocalStorage } from 'node:async_hooks';

export class RequestStore<T> {
  private readonly storage = new AsyncLocalStorage<T>();

  constructor(private readonly missingMessage: string) {}

  run<R>(store: T, work: () => Promise<R>): Promise<R> {
    return this.storage.run(store, work);
  }

  find(): T | undefined {
    return this.storage.getStore();
  }

  current(): T {
    const store = this.storage.getStore();
    if (!store) throw new Error(this.missingMessage);
    return store;
  }
}
