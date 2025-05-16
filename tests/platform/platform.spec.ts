import { vi } from 'vitest';
vi.mock('../../src/unifi', () => ({
  getAccessPoints: vi.fn()
}));
import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiAPLight } from '../../src/platform';
import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { DeviceCache } from '../../src/cache/deviceCache.js';
import { SessionManager } from '../../src/sessionManager.js';
import * as unifi from '../../src/unifi';
import { UnifiApiError, UnifiAuthError } from '../../src/models/unifiTypes.js';
import { PLUGIN_NAME, PLATFORM_NAME } from '../../src/settings.js';
import { createMockApi, mockLogger } from '../fixtures/homebridgeMocks.js';

// Mocks
const mockLog = { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };

const validConfig: PlatformConfig = {
  platform: PLUGIN_NAME,
  name: 'Test Platform',
  host: 'localhost',
  username: 'user',
  password: 'pass',
  sites: ['default'],
};

describe('UnifiAPLight Platform', () => {
  let platform: UnifiAPLight;
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = createMockApi();
    platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API);
  });

  it('should validate config and initialize', () => {
    expect(platform.config).toBeDefined();
    expect(platform.sessionManager).toBeInstanceOf(SessionManager);
    expect(platform.getDeviceCache()).toBeInstanceOf(DeviceCache);
  });

  it('should throw on invalid config', () => {
    expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, host: undefined }, mockApi as any as API)).toThrow();
    expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, username: undefined }, mockApi as any as API)).toThrow();
    expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, password: undefined }, mockApi as any as API)).toThrow();
  });

  it('should add accessory to cache on configureAccessory', () => {
    const accessory = { displayName: 'Test', UUID: 'uuid-1', context: {} } as PlatformAccessory;
    platform.configureAccessory(accessory);
    expect(platform.accessories).toContain(accessory);
  });
});

describe('UnifiAPLight uncovered logic', () => {
  let platform: UnifiAPLight;
  let sessionManager: SessionManager;
  let deviceCache: DeviceCache;
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = createMockApi();
    platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API);
    sessionManager = platform.sessionManager;
    deviceCache = platform.getDeviceCache();
    mockApi.registerPlatformAccessories.mockClear();
    mockApi.unregisterPlatformAccessories.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
  });

  it('should throw config errors for all invalid config fields', () => {
    expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, sites: 'not-array' }, mockApi as any as API)).toThrow('sites');
    expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, includeIds: 'not-array' }, mockApi as any as API)).toThrow('includeIds');
    expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, excludeIds: 'not-array' }, mockApi as any as API)).toThrow('excludeIds');
    expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, refreshIntervalMinutes: 0 }, mockApi as any as API)).toThrow('refreshIntervalMinutes');
    expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, refreshIntervalMinutes: 'bad' }, mockApi as any as API)).toThrow('refreshIntervalMinutes');
  });

  it('throws and logs config errors for malformed config fields', async () => {
    const configs = [
      { platform: PLUGIN_NAME, host: 123, username: 'u', password: 'p' }, // host wrong type
      { platform: PLUGIN_NAME, host: 'h', username: 123, password: 'p' }, // username wrong type
      { platform: PLUGIN_NAME, host: 'h', username: 'u', password: 123 }, // password wrong type
      { platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', sites: 123 }, // sites wrong type
      { platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', includeIds: 123 }, // includeIds wrong type
      { platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', excludeIds: 123 }, // excludeIds wrong type
      { platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', refreshIntervalMinutes: 'bad' }, // refreshIntervalMinutes wrong type
    ];
    for (const config of configs) {
      expect(() => new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any)).toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    }
  });

  it('discoverDevices handles UnifiAuthError', async () => {
    vi.spyOn(sessionManager, 'authenticate').mockRejectedValueOnce(new UnifiAuthError('fail'));
    await platform.discoverDevices();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'));
  });

  it('discoverDevices handles generic error', async () => {
    vi.spyOn(sessionManager, 'authenticate').mockRejectedValueOnce(new Error('fail'));
    await platform.discoverDevices();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected error'));
  });

  it('discoverDevices aborts if no valid sites', async () => {
    vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined);
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue(undefined);
    await platform.discoverDevices();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No valid sites'));
  });

  it('discoverDevices warns if no access points', async () => {
    vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined);
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default');
    vi.spyOn(unifi, 'getAccessPoints').mockResolvedValueOnce([]);
    await platform.discoverDevices();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No access points'));
  });
  it('discoverDevices adds, restores, and removes accessories', async () => {
    // Setup all spies/mocks BEFORE constructing the platform
    let RealPlatformAccessory: any;
    try {
      RealPlatformAccessory = require('homebridge/lib/platformAccessory').PlatformAccessory;
      if (typeof RealPlatformAccessory !== 'function' || !RealPlatformAccessory.prototype) {
        throw new Error('Real PlatformAccessory is not a class');
      }
    } catch (e) {
      throw new Error('Test requires the real homebridge PlatformAccessory class. Patch the require path or install homebridge as a devDependency. Error: ' + e);
    }
    // Use the real PlatformAccessory class for registration
    mockApi.platformAccessory = RealPlatformAccessory;
    // Set up spies for API methods
    const registerSpy = vi.fn();
    mockApi.registerPlatformAccessories = registerSpy;
    const unregisterSpy = mockApi.unregisterPlatformAccessories;
    // Patch the platform's api property after construction to ensure .api points to the same object
    // Do NOT import or spy on homebridge/lib/util/uuid; use mockApi.hap.uuid.generate as provided
    // Set up all other mocks/spies
    const ap = { _id: 'id1', name: 'AP1', type: 'uap', site: 'default', model: 'UAP', serial: 'SN12345', version: 'v', mac: '00:11:22:33:44:55' };
    vi.spyOn(unifi, 'getAccessPoints').mockResolvedValue([ap]);
    // Mock SessionManager methods BEFORE platform construction
    vi.spyOn(SessionManager.prototype, 'authenticate').mockResolvedValue(undefined);
    vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default');
    // Construct the platform instance AFTER all mocks are set up
    const platform = new UnifiAPLight(mockLogger as any, { ...validConfig }, mockApi);
    // Assert that the platform is using the same API object as the spy
    expect(platform.api).toBe(mockApi);
    platform.getDeviceCache().clear();
    // --- ADD PHASE ---
    // No cached accessories: Homebridge would not call configureAccessory
    // Simulate Homebridge startup event
    await Promise.all(
      mockApi.on.mock.calls
        .filter(([event]) => event === 'didFinishLaunching')
        .map(([, handler]) => handler.call(platform)) // Ensure correct `this` context
    );
    // Await a microtask to ensure all async work is done
    await new Promise(resolve => setTimeout(resolve, 0));
    // discoverDevices is called by didFinishLaunching handler
    // Ensure accessory is tracked and registered
    mockLogger.info.mockClear();
    expect(platform.accessories.length).toBe(1);
    expect(platform.accessories[0].displayName).toBe(ap.name);
    expect(registerSpy).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [platform.accessories[0]]);
    // --- REMOVE PHASE ---
    platform.config.excludeIds = [ap._id];
    const uuid = mockApi.hap.uuid.generate(ap._id);
    const accessory = new mockApi.platformAccessory(ap.name, uuid);
    accessory.context.accessPoint = ap;
    // Simulate Homebridge restoring cached accessory
    platform.configureAccessory(accessory);
    // Remove any duplicate accessories with the same UUID before removal phase
    const idx = platform.accessories.findIndex(a => a.UUID === uuid);
    if (idx !== -1) {
      platform.accessories.splice(idx, 1);
    }
    // Simulate Homebridge startup event again
    await Promise.all(
      mockApi.on.mock.calls
        .filter(([event]) => event === 'didFinishLaunching')
        .map(([, handler]) => handler.call(platform)) // Ensure correct `this` context
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(unregisterSpy).toHaveBeenCalled();
    // Property-based check: accessory with this UUID should be removed
    expect(platform.accessories.find(a => a.UUID === uuid)).toBeUndefined();
    // --- RESTORE PHASE ---
    platform.config.excludeIds = [];
    platform.config.includeIds = [ap._id];
    platform.getDeviceCache().clear();
    platform.getDeviceCache().setDevices([ap]);
    const restoredAccessory = new mockApi.platformAccessory(ap.name, uuid);
    restoredAccessory.context.accessPoint = ap;
    // Simulate Homebridge restoring cached accessory
    platform.configureAccessory(restoredAccessory);
    // Simulate Homebridge startup event again
    await Promise.all(
      mockApi.on.mock.calls
        .filter(([event]) => event === 'didFinishLaunching')
        .map(([, handler]) => handler.call(platform)) // Ensure correct `this` context
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Restoring existing accessory'));
    // Property-based check: accessory with this UUID should be present and only one
    expect(platform.accessories.find(a => a.UUID === uuid)).toBeDefined();
    expect(platform.accessories.length).toBe(1);
  });
});
