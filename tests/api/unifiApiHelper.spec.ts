import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js';
import { loadFixture } from '../fixtures/apiFixtures.js';

describe('UnifiApiHelper', () => {
  let apiHelper: UnifiApiHelper;

  beforeEach(() => {
    apiHelper = new UnifiApiHelper();
  });

  it('should resolve device list endpoint for self-hosted', () => {
    apiHelper.setApiType(UnifiApiType.SelfHosted);
    expect(apiHelper.getDeviceListEndpoint('default')).toBe('/api/s/default/stat/device');
  });

  it('should resolve device update endpoint for self-hosted', () => {
    apiHelper.setApiType(UnifiApiType.SelfHosted);
    expect(apiHelper.getDeviceUpdateEndpoint('default', 'deviceid')).toBe('/api/s/default/rest/device/deviceid');
  });

  it('should resolve sites endpoint for self-hosted', () => {
    apiHelper.setApiType(UnifiApiType.SelfHosted);
    expect(apiHelper.getSitesEndpoint()).toBe('/api/self/sites');
  });

  it('should resolve device list endpoint for UniFi OS', () => {
    apiHelper.setApiType(UnifiApiType.UnifiOS);
    expect(apiHelper.getDeviceListEndpoint('default')).toBe('/proxy/network/api/s/default/stat/device');
  });

  it('should resolve device update endpoint for UniFi OS', () => {
    apiHelper.setApiType(UnifiApiType.UnifiOS);
    expect(apiHelper.getDeviceUpdateEndpoint('default', 'deviceid')).toBe('/proxy/network/api/s/default/rest/device/deviceid');
  });

  it('should resolve sites endpoint for UniFi OS', () => {
    apiHelper.setApiType(UnifiApiType.UnifiOS);
    expect(apiHelper.getSitesEndpoint()).toBe('/proxy/network/api/self/sites');
  });

  it('should detect API type from site-list-success.json (integration)', async () => {
    // Simulate detection logic using fixture
    // This is a placeholder for future integration
    expect(apiHelper).toBeDefined();
  });

  it('should get/set apiType and return null if not set', () => {
    const helper = new UnifiApiHelper();
    expect(helper.getApiType()).toBeNull();
    helper.setApiType(UnifiApiType.SelfHosted);
    expect(helper.getApiType()).toBe(UnifiApiType.SelfHosted);
  });

  it('should throw if detectApiType fails both endpoints', async () => {
    const instance = { post: vi.fn().mockRejectedValue(new Error('fail')) };
    const log = { debug: vi.fn(), error: vi.fn() };
    await expect(apiHelper.detectApiType(instance as any, 'u', 'p', log)).rejects.toThrow('Unable to detect UniFi API structure.');
    expect(log.error).toHaveBeenCalledWith('Failed to detect UniFi API structure:', expect.any(Error));
  });

  it('should detect UnifiOS API type', async () => {
    const instance = { post: vi.fn().mockResolvedValueOnce({}) };
    const log = { debug: vi.fn(), error: vi.fn() };
    const type = await apiHelper.detectApiType(instance as any, 'u', 'p', log);
    expect(type).toBe(UnifiApiType.UnifiOS);
    expect(apiHelper.getApiType()).toBe(UnifiApiType.UnifiOS);
  });

  it('should detect SelfHosted API type if UnifiOS fails', async () => {
    const instance = {
      post: vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({}),
    };
    const log = { debug: vi.fn(), error: vi.fn() };
    const type = await apiHelper.detectApiType(instance as any, 'u', 'p', log);
    expect(type).toBe(UnifiApiType.SelfHosted);
    expect(apiHelper.getApiType()).toBe(UnifiApiType.SelfHosted);
  });

  it('should call all UnifiApiHelper methods directly for coverage', () => {
    const helper = new UnifiApiHelper();
    // getApiType before set
    expect(helper.getApiType()).toBeNull();
    // setApiType and getApiType
    helper.setApiType(UnifiApiType.SelfHosted);
    expect(helper.getApiType()).toBe(UnifiApiType.SelfHosted);
    // getDeviceListEndpoint
    expect(helper.getDeviceListEndpoint('mysite')).toBe('/api/s/mysite/stat/device');
    // getDeviceUpdateEndpoint
    expect(helper.getDeviceUpdateEndpoint('mysite', 'dev1')).toBe('/api/s/mysite/rest/device/dev1');
    // getSitesEndpoint
    expect(helper.getSitesEndpoint()).toBe('/api/self/sites');
    // Switch to UnifiOS and check endpoints
    helper.setApiType(UnifiApiType.UnifiOS);
    expect(helper.getDeviceListEndpoint('mysite')).toBe('/proxy/network/api/s/mysite/stat/device');
    expect(helper.getDeviceUpdateEndpoint('mysite', 'dev1')).toBe('/proxy/network/api/s/mysite/rest/device/dev1');
    expect(helper.getSitesEndpoint()).toBe('/proxy/network/api/self/sites');
  });
});
