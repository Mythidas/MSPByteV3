import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
} from "$env/static/public";
import { createServerClient } from "@supabase/ssr";
import { redirect, type Handle } from "@sveltejs/kit";
import { hasPermission } from "$lib/utils/permissions";
import { getRoutePermission } from "$lib/utils/route-permissions";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    {
      cookies: {
        getAll() {
          return event.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            event.cookies.set(name, value, {
              ...options,
              path: "/",
            });
          });
        },
      },
    },
  );

  const { data: session } = await event.locals.supabase.auth.getUser();
  if (session.user) {
    const { data: profile, error } = await event.locals.supabase
      .from("users")
      .select(
        "id, tenant_id, role_id, first_name, last_name, email, preferences, created_at, updated_at",
      )
      .eq("email", session.user.email)
      .single();

    if (!error && profile) {
      event.locals.user = profile;

      const { data: role } = await event.locals.supabase
        .from("roles")
        .select(
          "id, name, attributes, description, level, tenant_id, created_at, updated_at",
        )
        .eq("id", profile.role_id)
        .single();
      event.locals.role = role ?? null;
    } else {
      await event.locals.supabase.auth.signOut();
      console.warn(
        "No public.users row found for authenticated user",
        session.user,
      );
    }
  }

  const pathname = event.url.pathname;
  const isAuthRoute = pathname.startsWith("/auth");
  const isPublicRoute = pathname !== "/";

  if (session) {
    if (isAuthRoute) {
      throw redirect(303, "/home");
    }

    // Permission guard
    const requiredPermission = getRoutePermission(pathname);
    if (
      requiredPermission &&
      !hasPermission(
        event.locals.role?.attributes as Record<string, unknown>,
        requiredPermission,
      )
    ) {
      const msg = encodeURIComponent(
        "You do not have permission to access this page.",
      );
      throw redirect(303, `/error?code=403&message=${msg}`);
    }
  } else {
    if (!isAuthRoute && !isPublicRoute) {
      throw redirect(303, "/auth/login");
    }
  }

  const response = await resolve(event);
  return response;
};
