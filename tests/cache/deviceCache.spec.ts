import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceCache } from '../../src/cache/deviceCache.js';
import { UnifiDevice } from '../../src/models/unifiTypes.js';

describe('DeviceCache', () => {
  let cache: DeviceCache;
  const deviceA: UnifiDevice = { _id: 'a', name: 'AP A', type: 'uap', site: 'default' } as any;
  const deviceB: UnifiDevice = { _id: 'b', name: 'AP B', type: 'udm', site: 'default' } as any;

  beforeEach(() => {
    cache = new DeviceCache();
  });

  it('should store and retrieve devices by ID', () => {
    cache.setDevices([deviceA, deviceB]);
    expect(cache.getDeviceById('a')).toEqual(deviceA);
    expect(cache.getDeviceById('b')).toEqual(deviceB);
  });

  it('should return all devices', () => {
    cache.setDevices([deviceA, deviceB]);
    expect(cache.getAllDevices()).toHaveLength(2);
  });

  it('should return undefined for missing device', () => {
    expect(cache.getDeviceById('missing')).toBeUndefined();
  });
});
