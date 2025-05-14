import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiAPLight } from '../../src/platform.js';
import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { DeviceCache } from '../../src/cache/deviceCache.js';
import { SessionManager } from '../../src/sessionManager.js';

// Mocks
const mockApi = {
  hap: {
    Service: {},
    Characteristic: {},
    uuid: { generate: vi.fn((id) => `uuid-${id}`) },
  },
  on: vi.fn((event, cb) => { if (event === 'didFinishLaunching') cb(); }),
  platformAccessory: vi.fn((name, uuid) => ({ context: {}, UUID: uuid, displayName: name })),
  unregisterPlatformAccessories: vi.fn(),
  registerPlatformAccessories: vi.fn(),
};
const mockLog = { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };

const validConfig: PlatformConfig = {
  platform: 'TestPlatform',
  name: 'Test Platform',
  host: 'localhost',
  username: 'user',
  password: 'pass',
  sites: ['default'],
};

describe('UnifiAPLight Platform', () => {
  let platform: UnifiAPLight;

  beforeEach(() => {
    vi.clearAllMocks();
    platform = new UnifiAPLight(mockLog as any as Logger, validConfig, mockApi as any as API);
  });

  it('should validate config and initialize', () => {
    expect(platform.config).toBeDefined();
    expect(platform.sessionManager).toBeInstanceOf(SessionManager);
    expect(platform.getDeviceCache()).toBeInstanceOf(DeviceCache);
  });

  it('should throw on invalid config', () => {
    expect(() => new UnifiAPLight(mockLog as any as Logger, { ...validConfig, host: undefined }, mockApi as any as API)).toThrow();
    expect(() => new UnifiAPLight(mockLog as any as Logger, { ...validConfig, username: undefined }, mockApi as any as API)).toThrow();
    expect(() => new UnifiAPLight(mockLog as any as Logger, { ...validConfig, password: undefined }, mockApi as any as API)).toThrow();
  });

  it('should add accessory to cache on configureAccessory', () => {
    const accessory = { displayName: 'Test', UUID: 'uuid-1', context: {} } as PlatformAccessory;
    platform.configureAccessory(accessory);
    expect(platform.accessories).toContain(accessory);
  });

  // More integration tests can be added for discoverDevices, refreshDeviceCache, etc. with deeper mocks
});
