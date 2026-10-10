import { createMemoryStore } from './memoryStore.js';
import { createSupabaseStore } from './supabaseStore.js';

export function createStore(config) {
  return config.supabase.url ? createSupabaseStore(config.supabase) : createMemoryStore();
}
