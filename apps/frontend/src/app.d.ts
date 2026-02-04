// See https://svelte.dev/docs/kit/types#app.d.ts

import type { ORM } from "@workspace/shared/lib/utils/orm";
import type { Tables } from "@workspace/shared/types/database";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      orm: ORM;
      session: Tables<"public", "users">;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
