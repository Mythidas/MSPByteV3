// See https://svelte.dev/docs/kit/types#app.d.ts

import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { ORM } from '@workspace/shared/lib/utils/orm';
import type { Tables } from '@workspace/shared/types/database';

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      orm: ORM;
      supabase: SupabaseClient;
      user: Tables<'public', 'users'> | null;
      getSession: () => Promise<User | null>;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
