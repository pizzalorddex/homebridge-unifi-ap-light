import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAccessPoint, getAccessPoints } from '../../src/unifi.js';
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js';
import { Logger } from 'homebridge';

describe('unifi.ts', () => {
  let apiHelper: UnifiApiHelper;
  let log: Logger;

  beforeEach(() => {
    apiHelper = new UnifiApiHelper();
    apiHelper.setApiType(UnifiApiType.SelfHosted);
    log = { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any;
  });

  it('should return undefined if device not found', async () => {
    const request = vi.fn().mockResolvedValue({ data: { data: [] } });
    await expect(getAccessPoint('notfound', request, apiHelper, ['default'], log)).rejects.toThrow('Failed to fetch any access points from any site.');
  });

  it('should throw on API error (404)', async () => {
    const request = vi.fn().mockRejectedValue({ response: { status: 404, data: {} }, message: 'Not found' });
    await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow();
  });

  it('should skip NoSiteContext error', async () => {
    const request = vi.fn().mockRejectedValue({ response: { data: { meta: { msg: 'api.err.NoSiteContext' } } }, message: 'NoSiteContext' });
    await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow();
  });

  it('should filter only valid AP/UDM devices', async () => {
    const request = vi.fn().mockResolvedValue({ data: { data: [
      { _id: 'a', type: 'uap', site: 'default' },
      { _id: 'b', type: 'udm', model: 'UDM', site: 'default' },
      { _id: 'c', type: 'switch', site: 'default' },
    ] } });
    const result = await getAccessPoints(request, apiHelper, ['default'], log);
    expect(result).toHaveLength(2);
  });

  it('should aggregate devices from multiple sites', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { data: [{ _id: 'a', type: 'uap', site: 'site1' }] } })
      .mockResolvedValueOnce({ data: { data: [{ _id: 'b', type: 'uap', site: 'site2' }] } });
    const result = await getAccessPoints(request, apiHelper, ['site1', 'site2'], log);
    expect(result).toHaveLength(2);
  });

  // More tests will be added using fixtures and error mocks
});
