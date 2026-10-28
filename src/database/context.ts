import { AsyncLocalStorage } from 'node:async_hooks';
import { School } from '../modules/schools/school.model';
import { Post } from '../modules/tickets/post.model';
import { Ticket } from '../modules/tickets/ticket.model';
import { User } from '../modules/users/user.model';
import type { DatabaseTarget } from './routing';

export interface AppModels {
  User: typeof User;
  School: typeof School;
  Ticket: typeof Ticket;
  Post: typeof Post;
}

/** Models inicializados em `getSequelize` (conexão `DB_*`). */
export const defaultModels: AppModels = { User, School, Ticket, Post };

interface DatabaseStore {
  target: DatabaseTarget;
  models: AppModels;
}

const storage = new AsyncLocalStorage<DatabaseStore>();

export function activeModels(): AppModels {
  return storage.getStore()?.models ?? defaultModels;
}

export function currentDatabaseTarget(): DatabaseTarget | undefined {
  return storage.getStore()?.target;
}

export function runWithDatabase<T>(target: DatabaseTarget, models: AppModels, fn: () => T): T {
  return storage.run({ target, models }, fn);
}
