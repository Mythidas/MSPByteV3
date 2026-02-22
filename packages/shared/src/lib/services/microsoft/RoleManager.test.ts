import { describe, it, expect, vi } from 'vitest';
import { Microsoft365RoleManager } from './RoleManager.js';

const ROLES = { 'Exchange Administrator': 'role-guid-1', 'Teams Admin': 'role-guid-2' };

function makeConnector(
  overrides: Partial<{ spId: string | null; assignOk: boolean }> = {}
) {
  const { spId = 'sp-123', assignOk = true } = overrides;
  return {
    getServicePrincipalId: vi.fn().mockResolvedValue({ data: spId, error: undefined }),
    assignDirectoryRole: vi.fn().mockResolvedValue(
      assignOk ? { data: true } : { data: undefined, error: { message: 'forbidden' } }
    ),
  };
}

describe('Microsoft365RoleManager', () => {
  it('assigns all roles and returns them in assigned[]', async () => {
    const connector = makeConnector();
    const { assigned, failed } = await new Microsoft365RoleManager(connector as any).ensureDirectoryRoles(
      ROLES
    );
    expect(assigned).toEqual(expect.arrayContaining(['Exchange Administrator', 'Teams Admin']));
    expect(failed).toHaveLength(0);
    expect(connector.assignDirectoryRole).toHaveBeenCalledTimes(2);
  });

  it('returns all roles as failed when SP is not found', async () => {
    const connector = makeConnector({ spId: null });
    const { assigned, failed } = await new Microsoft365RoleManager(connector as any).ensureDirectoryRoles(
      ROLES
    );
    expect(assigned).toHaveLength(0);
    expect(failed).toHaveLength(2);
    expect(connector.assignDirectoryRole).not.toHaveBeenCalled();
  });

  it('splits correctly when one role assignment fails', async () => {
    const connector = {
      getServicePrincipalId: vi.fn().mockResolvedValue({ data: 'sp-123' }),
      assignDirectoryRole: vi
        .fn()
        .mockResolvedValueOnce({ data: true })
        .mockResolvedValueOnce({ data: undefined, error: { message: 'forbidden' } }),
    };
    const { assigned, failed } = await new Microsoft365RoleManager(connector as any).ensureDirectoryRoles(
      ROLES
    );
    expect(assigned).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });

  it('returns all roles as failed when getServicePrincipalId returns an error', async () => {
    const connector = {
      getServicePrincipalId: vi
        .fn()
        .mockResolvedValue({ data: undefined, error: { message: 'unauthorized' } }),
      assignDirectoryRole: vi.fn(),
    };
    const { assigned, failed } = await new Microsoft365RoleManager(connector as any).ensureDirectoryRoles(
      ROLES
    );
    expect(assigned).toHaveLength(0);
    expect(failed).toHaveLength(2);
    expect(connector.assignDirectoryRole).not.toHaveBeenCalled();
  });
});
