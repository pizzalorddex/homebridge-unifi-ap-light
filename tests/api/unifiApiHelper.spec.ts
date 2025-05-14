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

  // Add more tests for UniFi OS endpoints if/when you have real samples

  it('should detect API type from site-list-success.json', async () => {
    // Simulate detection logic using fixture
    // (You may need to mock Axios for full coverage)
    // This is a placeholder for future integration
    expect(apiHelper).toBeDefined();
  });
});
