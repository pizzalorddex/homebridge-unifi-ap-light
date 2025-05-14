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
});
