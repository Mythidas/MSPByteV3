import type { PageServerLoad } from "./$types";
import { supabaseServer } from "$lib/server/supabase";

export const load: PageServerLoad = async () => {
  const user = await supabaseServer.from("users").select("*").single();

  await supabaseServer.auth.admin.updateUserById(user.data?.id || "", {
    app_metadata: {
      tenant_id: user.data?.tenant_id,
      role_id: user.data?.role_id,
    },
  });
};
