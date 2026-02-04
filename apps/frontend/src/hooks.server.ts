import { supabase } from "$lib/supabase";
import type { Handle } from "@sveltejs/kit";
import { ORM } from "@workspace/shared/lib/utils/orm";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.orm = new ORM(supabase);
  event.locals.session = {
    id: "ea3b7111-febe-47a2-b471-43873e6d39e7",
    tenant_id: 1,
    role_id: 1,
    first_name: "Blake",
    last_name: "Prejean",
    email: "blake@mspbyte.pro",
    preferences: "{}",
    created_at: "2026-02-02 21:40:35.256847+00",
    updated_at: "2026-02-02 21:40:35.256847+00",
  };
  const response = await resolve(event);
  return response;
};
