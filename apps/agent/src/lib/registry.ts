import { invoke } from '@tauri-apps/api/core';
import { Logger, APIResponse } from '@workspace/shared/lib/utils/logger';

export async function getRegistryValue(path: string, key: string): Promise<APIResponse<string>> {
  try {
    const result = await invoke<string>('read_registry_value', {
      path,
      key,
    });
    if (!result) throw `Invalid key path`;

    return {
      data: result,
    };
  } catch (err) {
    return Logger.error({
      module: 'Registry',
      context: 'getRegistryKey',
      message: `Failed to get registry value: ${err}`,
    });
  }
}
