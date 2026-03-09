import { goto } from '$app/navigation';
import { supabase } from '$lib/utils/supabase';
import type { Tables } from '@workspace/shared/types/database';
import { PersistedState } from 'runed';

type User = Tables<'public', 'users'>;
type Role = Tables<'public', 'roles'>;
type Tenant = Tables<'public', 'tenants'>;

function createAuthStore() {
  const user = new PersistedState<User | null>('current_user', null, {
    storage: 'session',
    syncTabs: false,
  });
  const role = new PersistedState<Role | null>('current_role', null, {
    storage: 'session',
    syncTabs: false,
  });
  const tenant = new PersistedState<Tenant | null>('current_tenant', null, {
    storage: 'session',
    syncTabs: false,
  });

  return {
    get currentUser() {
      return user.current;
    },
    get currentRole() {
      return role.current;
    },
    get currentTenant() {
      return tenant.current;
    },
    set currentUser(u: User | null) {
      user.current = u;
    },
    set currentRole(r: Role | null) {
      role.current = r;
    },
    set currentTenant(t: Tenant | null) {
      tenant.current = t;
    },

    logout: async () => {
      await supabase.auth.signOut({ scope: 'local' });
      user.current = null;
      role.current = null;
      tenant.current = null;
      goto('/auth/login');
    },
  };
}

export const authStore = createAuthStore();
