import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiAPLight } from '../../src/platform.js';
import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { DeviceCache } from '../../src/cache/deviceCache.js';
import { SessionManager } from '../../src/sessionManager.js';
import * as unifi from '../../src/unifi.js';
import { UnifiApiError, UnifiAuthError } from '../../src/models/unifiTypes.js';
import { PLUGIN_NAME, PLATFORM_NAME } from '../../src/settings.js';

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

describe('UnifiAPLight uncovered logic', () => {
  let platform: UnifiAPLight;
  let sessionManager: SessionManager;
  let deviceCache: DeviceCache;
  let api: any;
  let log: any;

  // Enhanced Homebridge HAP mocks
  const mockService = {
    setCharacteristic: vi.fn().mockReturnThis(),
    getCharacteristic: vi.fn().mockReturnThis(),
    onSet: vi.fn().mockReturnThis(),
    onGet: vi.fn().mockReturnThis(),
    updateCharacteristic: vi.fn(),
  };
  const mockHap = {
    Service: {
      Lightbulb: {},
      AccessoryInformation: {},
    },
    Characteristic: {
      Name: 'Name',
      On: 'On',
      Manufacturer: 'Manufacturer',
      Model: 'Model',
      SerialNumber: 'SerialNumber',
      FirmwareRevision: 'FirmwareRevision',
    },
    uuid: { generate: vi.fn((id) => `uuid-${id}`) },
  };

  // Custom API mock that does NOT trigger didFinishLaunching automatically
  const customApi = {
    hap: mockHap,
    on: vi.fn(),
    platformAccessory: mockApi.platformAccessory,
    unregisterPlatformAccessories: vi.fn(),
    registerPlatformAccessories: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api = { ...customApi };
    log = { ...mockLog };
    platform = new UnifiAPLight(log as any as Logger, validConfig, api as any as API);
    sessionManager = platform.sessionManager;
    deviceCache = platform.getDeviceCache();
    // Reset mocks for each test
    api.registerPlatformAccessories.mockClear();
    api.unregisterPlatformAccessories.mockClear();
    log.warn.mockClear();
    log.error.mockClear();
    log.info.mockClear();
  });

  it('should throw config errors for all invalid config fields', () => {
    expect(() => new UnifiAPLight(log, { ...validConfig, sites: 'not-array' }, api)).toThrow('sites');
    expect(() => new UnifiAPLight(log, { ...validConfig, includeIds: 'not-array' }, api)).toThrow('includeIds');
    expect(() => new UnifiAPLight(log, { ...validConfig, excludeIds: 'not-array' }, api)).toThrow('excludeIds');
    expect(() => new UnifiAPLight(log, { ...validConfig, refreshIntervalMinutes: 0 }, api)).toThrow('refreshIntervalMinutes');
    expect(() => new UnifiAPLight(log, { ...validConfig, refreshIntervalMinutes: 'bad' }, api)).toThrow('refreshIntervalMinutes');
  });

  it('getApiRequestWithHelper returns request with apiHelper', () => {
    const req = (platform as any).getApiRequestWithHelper();
    expect(typeof req).toBe('function');
    expect(req.apiHelper).toBe(sessionManager.getApiHelper());
  });

  it('discoverDevices handles UnifiAuthError', async () => {
    vi.spyOn(sessionManager, 'authenticate').mockRejectedValueOnce(new UnifiAuthError('fail'));
    await platform.discoverDevices();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'));
  });

  it('discoverDevices handles generic error', async () => {
    vi.spyOn(sessionManager, 'authenticate').mockRejectedValueOnce(new Error('fail'));
    await platform.discoverDevices();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected error'));
  });

  it('discoverDevices aborts if no valid sites', async () => {
    vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined);
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue(undefined);
    await platform.discoverDevices();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('No valid sites'));
  });

  it('discoverDevices warns if no access points', async () => {
    vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined);
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default');
    vi.spyOn(unifi, 'getAccessPoints').mockResolvedValueOnce([]);
    await platform.discoverDevices();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('No access points'));
  });
  it('discoverDevices adds, restores, and removes accessories', async () => {
    // --- Improved Mocks ---
    // Consistent UUID generator
    const uuidMap = new Map<string, string>();
    api.hap.uuid.generate = vi.fn((id) => {
      if (!uuidMap.has(id)) uuidMap.set(id, `uuid-${id}`);
      return uuidMap.get(id)!;
    });
    // Class-like constructor for platformAccessory with Homebridge-like methods
    class MockAccessory {
      context: any = {};
      UUID: string;
      displayName: string;
      removeService = vi.fn();
      addService = vi.fn(() => mockService);
      getService = vi.fn(() => mockService);
      constructor(name: string, uuid: string) {
        this.displayName = name;
        this.UUID = uuid;
      }
    }
    api.platformAccessory = MockAccessory;
    // --- Test Logic ---
    platform.accessories.length = 0; // Clear cache
    platform.getDeviceCache().clear(); // Clear device cache
    api.registerPlatformAccessories.mockClear();
    api.unregisterPlatformAccessories.mockClear();
    log.info.mockClear();
    // Setup AP
    const ap = { _id: 'id1', name: 'AP1', type: 'uap', site: 'default', model: 'UAP', serial: 's', version: 'v', mac: '00:11:22:33:44:55' };
    vi.spyOn(sessionManager, 'authenticate').mockResolvedValue(undefined);
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default');
    vi.spyOn(unifi, 'getAccessPoints').mockResolvedValue([ap]);
    // Add: should register
    await platform.discoverDevices();
    // Debug output
    // eslint-disable-next-line no-console
    console.log('After add:', {
      accessories: platform.accessories.map(a => ({ displayName: a.displayName, UUID: a.UUID })),
      registerCalls: api.registerPlatformAccessories.mock.calls,
      deviceCache: platform.getDeviceCache().getAllDevices(),
    });
    expect(api.registerPlatformAccessories).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [expect.objectContaining({ displayName: ap.name, UUID: `uuid-${ap._id}` })]);
    // Add to accessories for restore/remove
    const mockAccessory = new api.platformAccessory(ap.name, api.hap.uuid.generate(ap._id));
    mockAccessory.context.accessPoint = ap;
    platform.accessories.length = 0;
    platform.accessories.push(mockAccessory);
    platform.getDeviceCache().clear();
    platform.getDeviceCache().setDevices([ap]);
    // Exclude: should remove
    platform.config.excludeIds = [ap._id];
    api.unregisterPlatformAccessories.mockClear();
    await platform.discoverDevices();
    // Debug output
    // eslint-disable-next-line no-console
    console.log('After exclude:', {
      accessories: platform.accessories.map(a => ({ displayName: a.displayName, UUID: a.UUID })),
      unregisterCalls: api.unregisterPlatformAccessories.mock.calls,
      deviceCache: platform.getDeviceCache().getAllDevices(),
    });
    expect(api.unregisterPlatformAccessories).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [mockAccessory]);
    // Include: should restore
    platform.config.excludeIds = [];
    platform.config.includeIds = [ap._id];
    log.info.mockClear();
    platform.getDeviceCache().clear();
    platform.getDeviceCache().setDevices([ap]);
    await platform.discoverDevices();
    // Debug output
    // eslint-disable-next-line no-console
    console.log('After include:', {
      accessories: platform.accessories.map(a => ({ displayName: a.displayName, UUID: a.UUID })),
      infoCalls: log.info.mock.calls,
      deviceCache: platform.getDeviceCache().getAllDevices(),
    });
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Restoring existing accessory'));
  });

  it('discoverDevices handles UnifiApiError and AxiosError', async () => {
    vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined);
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default');
    vi.spyOn(unifi, 'getAccessPoints').mockRejectedValueOnce(new UnifiApiError('fail'));
    await platform.discoverDevices();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Device discovery failed'));
    vi.spyOn(unifi, 'getAccessPoints').mockRejectedValueOnce({ message: 'fail' });
    await platform.discoverDevices();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Device discovery failed'));
  });
  it('refreshDeviceCache handles re-authentication and errors', async () => {
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default');
    // Simulate error on both attempts to getAccessPoints
    const apiError = new UnifiApiError('fail');
    vi.spyOn(unifi, 'getAccessPoints').mockRejectedValue(apiError);
    vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined);
    log.error.mockClear();
    await (platform as any).refreshDeviceCache();
    // Debug output
    // eslint-disable-next-line no-console
    // console.log('After refreshDeviceCache error:', {
    //   logErrorCalls: log.error.mock.calls,
    //   errorType: apiError.constructor.name,
    //   errorInstance: apiError,
    // });
    expect(log.error).toHaveBeenCalledWith('Device cache refresh failed: fail');
    // Simulate UnifiAuthError
    const authError = new UnifiAuthError('fail');
    vi.spyOn(unifi, 'getAccessPoints').mockRejectedValueOnce(authError);
    log.error.mockClear();
    await (platform as any).refreshDeviceCache();
    expect(log.error).toHaveBeenCalledWith('Device cache refresh failed: Failed to detect UniFi API structure during authentication');
  });
  it('refreshDeviceCache logs error if no valid sites', async () => {
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue(undefined);
    log.error.mockClear();
    await (platform as any).refreshDeviceCache();
    expect(log.error).toHaveBeenCalledWith('No valid sites resolved. Aborting device cache refresh.');
  });

  it('refreshDeviceCache logs info if no devices returned', async () => {
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default');
    vi.spyOn(unifi, 'getAccessPoints').mockResolvedValueOnce([]);
    log.info.mockClear();
    await (platform as any).refreshDeviceCache();
    expect(log.info).toHaveBeenCalledWith('Device cache refreshed. 0 devices currently available.');
  });

  it('startDeviceCacheRefreshTimer can be called multiple times safely', () => {
    (platform as any).refreshTimer = setInterval(() => {}, 1000);
    const clearSpy = vi.spyOn(global, 'clearInterval');
    const setSpy = vi.spyOn(global, 'setInterval');
    (platform as any).startDeviceCacheRefreshTimer();
    (platform as any).startDeviceCacheRefreshTimer();
    expect(clearSpy).toHaveBeenCalledTimes(2);
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('refreshDeviceCache handles thrown string error', async () => {
    vi.restoreAllMocks();
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default');
    vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined); // Ensure authentication succeeds
    vi.spyOn(unifi, 'getAccessPoints').mockImplementation(() => Promise.reject('string error'));
    log.error.mockClear();
    await (platform as any).refreshDeviceCache();
    // Accept either two-argument or single-string logger call
    const calls = log.error.mock.calls;
    const found = calls.some(args =>
      (args.length === 2 && args[0] === 'Device cache refresh failed:' && args[1] === 'string error') ||
      (args.length === 1 && args[0] === 'Device cache refresh failed: string error')
    );
    if (!found) {
      throw new Error('log.error was not called with expected arguments for string error. Calls: ' + JSON.stringify(calls));
    }
  });

  it('refreshDeviceCache handles thrown non-Error object', async () => {
    vi.restoreAllMocks();
    vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default');
    vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined); // Ensure authentication succeeds
    vi.spyOn(unifi, 'getAccessPoints').mockImplementation(() => Promise.reject({ foo: 'bar' }));
    log.error.mockClear();
    await (platform as any).refreshDeviceCache();
    // Accept either two-argument or single-string logger call
    const calls = log.error.mock.calls;
    const found = calls.some(args =>
      (args.length === 2 && args[0] === 'Device cache refresh failed:' && args[1] && args[1].foo === 'bar') ||
      (args.length === 1 && typeof args[0] === 'string' && args[0].includes('Device cache refresh failed:') && args[0].includes('foo'))
    );
    if (!found) {
      throw new Error('log.error was not called with expected arguments for non-Error object. Calls: ' + JSON.stringify(calls));
    }
  });
});
