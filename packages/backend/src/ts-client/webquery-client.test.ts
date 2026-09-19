import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebQueryClient } from './webquery-client.js';
import { TSApiError } from '../middleware/error-handler.js';
const clients: WebQueryClient[] = [];
const make = (key = 'test-key') => {
  const c = new WebQueryClient('127.0.0.1', 1, key); clients.push(c); return c;
};
afterEach(() => { clients.splice(0).forEach((c) => c.destroy()); vi.restoreAllMocks(); });
describe('connection diagnostics', () => {
  it('does not accept a reachable version endpoint without credentials', async () => {
    const c = make(''); const execute = vi.spyOn(c, 'execute').mockResolvedValue([{ version: '6.0.0-beta13' }]);
    expect(await c.inspectConnection()).toMatchObject({ reachable: true, authenticated: false, success: false, stage: 'authentication' });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('rejects a guest identity even if it has a database ID', async () => {
    const c = make(); vi.spyOn(c, 'execute').mockResolvedValueOnce([{ version: '6.0.0-beta13' }]).mockResolvedValueOnce([{ client_database_id: '2', client_login_name: 'guest' }]);
    expect(await c.inspectConnection()).toMatchObject({ authenticated: false, success: false });
  });
  it('distinguishes authentication from missing management permissions', async () => {
    const c = make(); vi.spyOn(c, 'execute').mockResolvedValueOnce([{ version: '6.0.0-beta13' }]).mockResolvedValueOnce([{ client_database_id: '1', client_unique_identifier: 'serveradmin' }]).mockRejectedValueOnce(new TSApiError(2568, 'insufficient client permissions'));
    expect(await c.inspectConnection()).toMatchObject({ authenticated: true, permissions: false, success: false, stage: 'permissions' });
  });
  it('accepts successful read-only permission probes without returning key metadata', async () => {
    const c = make(); const execute = vi.spyOn(c, 'execute').mockResolvedValueOnce([{ version: '6.0.0-beta13' }]).mockResolvedValueOnce([{ client_database_id: '1' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'private-id' }]);
    const result = await c.inspectConnection();
    expect(result).toMatchObject({ success: true, permissions: true, authenticated: true });
    expect(execute.mock.calls.map((args) => args[1])).toEqual(['version', 'whoami', 'serverlist', 'apikeylist']);
    expect(JSON.stringify(result)).not.toContain('private-id');
  });
});
