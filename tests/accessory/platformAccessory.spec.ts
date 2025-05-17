import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UniFiAP } from '../../src/platformAccessory.js';
import { UnifiAPLight } from '../../src/platform.js';
import { PlatformAccessory, Service } from 'homebridge';

// moved from ../platformAccessory/platformAccessory.spec.ts

const mockService = {
  setCharacteristic: vi.fn().mockReturnThis(),
  getCharacteristic: vi.fn().mockReturnThis(),
  onSet: vi.fn().mockReturnThis(),
  onGet: vi.fn().mockReturnThis(),
  updateCharacteristic: vi.fn(),
};

const mockAccessory = {
  getService: vi.fn(() => mockService),
  addService: vi.fn(() => mockService),
  context: { accessPoint: { _id: 'ap1', name: 'Test AP', type: 'uap', site: 'default', model: 'UAP-AC', serial: '123', version: '1.0.0', led_override: 'on' } },
  displayName: 'Test AP',
};

// Use a shared mock cache instance for all tests
const sharedMockCache = {
  getDeviceById: vi.fn(() => mockAccessory.context.accessPoint),
  getAllDevices: vi.fn(() => [mockAccessory.context.accessPoint]),
  setDevices: vi.fn(),
};

const mockPlatform = {
  getDeviceCache: () => sharedMockCache,
  config: { sites: ['default'] },
  sessionManager: { getApiHelper: () => ({ getDeviceUpdateEndpoint: vi.fn(() => '/api/s/default/rest/device/ap1') }), request: vi.fn().mockResolvedValue({ status: 200 }) },
  Service: { AccessoryInformation: {}, Lightbulb: {} },
  Characteristic: { Manufacturer: 'Manufacturer', Model: 'Model', SerialNumber: 'SerialNumber', FirmwareRevision: 'FirmwareRevision', Name: 'Name', On: 'On' },
  api: { hap: { uuid: { generate: vi.fn((id) => `uuid-${id}`) } } },
  log: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
};

describe('UniFiAP Accessory', () => {
  let accessory: UniFiAP;

  beforeEach(() => {
    vi.clearAllMocks();
    sharedMockCache.getDeviceById.mockReturnValue(mockAccessory.context.accessPoint);
    sharedMockCache.getAllDevices.mockReturnValue([mockAccessory.context.accessPoint]);
    sharedMockCache.setDevices.mockClear();
    accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory);
  });

  it('should initialize and patch missing site', () => {
    expect(accessory.accessPoint).toBeDefined();
    expect(mockAccessory.getService).toHaveBeenCalled();
    expect(mockService.setCharacteristic).toHaveBeenCalled();
  });

  it('should handle setOn and update cache', async () => {
    await accessory.setOn(true);
    expect(mockPlatform.sessionManager.request).toHaveBeenCalled();
    expect(mockPlatform.getDeviceCache().setDevices).toHaveBeenCalled();
  });

  it('should handle getOn for uap', async () => {
    const result = await accessory.getOn();
    expect(result).toBe(true);
  });

  it('should handle getOn for udm', async () => {
    const udm = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: { enabled: true } };
    sharedMockCache.getDeviceById.mockReturnValue(udm);
    sharedMockCache.getAllDevices.mockReturnValue([udm]);
    accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory);
    const result = await accessory.getOn();
    expect(result).toBe(true);
  });

  it('should patch missing site and log a warning', () => {
    const logSpy = { ...mockPlatform.log, warn: vi.fn() };
    const noSiteDevice = { ...mockAccessory.context.accessPoint, site: undefined };
    const noSiteAccessory = {
      ...mockAccessory,
      context: { accessPoint: { ...noSiteDevice } },
    };
    const singleSiteConfig = {
      ...mockPlatform,
      config: { sites: ['mysite'] },
      sessionManager: { ...mockPlatform.sessionManager, getSiteName: vi.fn(() => 'mysite-internal') },
      log: logSpy,
      getDeviceCache: () => ({
        getDeviceById: vi.fn(() => noSiteDevice),
        getAllDevices: vi.fn(() => [noSiteDevice]),
        setDevices: vi.fn(),
      }),
    };
    new UniFiAP(singleSiteConfig as any as UnifiAPLight, noSiteAccessory as any as PlatformAccessory);
    expect(logSpy.warn).toHaveBeenCalledWith(expect.stringContaining('Patching missing site'));
  });

  it('should log a warning if AccessoryInformation service is missing', () => {
    const accessoryInfoMissing = { ...mockAccessory, getService: vi.fn((svc) => (svc === mockPlatform.Service.AccessoryInformation ? undefined : mockService)) };
    new UniFiAP(mockPlatform as any as UnifiAPLight, accessoryInfoMissing as any as PlatformAccessory);
    expect(mockPlatform.log.warn).toHaveBeenCalledWith('Accessory Information Service not found.');
  });

  it('should add Lightbulb service if not found', () => {
    const lightbulbMissing = { ...mockAccessory, getService: vi.fn(() => undefined), addService: vi.fn(() => mockService) };
    new UniFiAP(mockPlatform as any as UnifiAPLight, lightbulbMissing as any as PlatformAccessory);
    expect(lightbulbMissing.addService).toHaveBeenCalled();
  });

  it('setOn: should log error and not update cache on non-200 response', async () => {
    mockPlatform.sessionManager.request.mockResolvedValueOnce({ status: 500 });
    await accessory.setOn(true);
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected response status'));
    expect(sharedMockCache.setDevices).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ led_override: 'on' })]));
  });

  it('setOn: should handle UnifiAuthError and set Not Responding', async () => {
    const error = new (class extends Error { })();
    Object.setPrototypeOf(error, { constructor: { name: 'UnifiAuthError' } });
    mockPlatform.sessionManager.request.mockRejectedValueOnce(error);
    await accessory.setOn(true);
    expect(mockPlatform.log.error).toHaveBeenCalled();
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
  });

  it('setOn: should handle generic error and set Not Responding', async () => {
    mockPlatform.sessionManager.request.mockRejectedValueOnce({ message: 'fail' });
    await accessory.setOn(true);
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('fail'));
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
  });

  it('setOn: should update ledSettings for udm', async () => {
    const udm = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: { enabled: false } };
    sharedMockCache.getDeviceById.mockReturnValue(udm);
    accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory);
    await accessory.setOn(true);
    expect(udm.ledSettings.enabled).toBe(true);
  });

  it('setOn: should update led_override for uap', async () => {
    const uap = { ...mockAccessory.context.accessPoint, type: 'uap', led_override: 'off' };
    sharedMockCache.getDeviceById.mockReturnValue(uap);
    accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory);
    await accessory.setOn(true);
    expect(uap.led_override).toBe('on');
  });

  it('getOn: should log error and set Not Responding if device not in cache', async () => {
    sharedMockCache.getDeviceById.mockImplementation(() => { return undefined as any; });
    const result = await accessory.getOn();
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('not found in cache'));
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
    expect(result).toBe(false);
  });

  it('getOn: should log error and set Not Responding if ledSettings.enabled is undefined', async () => {
    const udm = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: {} };
    sharedMockCache.getDeviceById.mockReturnValue(udm);
    const result = await accessory.getOn();
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('enabled'));
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
    expect(result).toBe(false);
  });

  it('getOn: should handle UnifiApiError and set Not Responding', async () => {
    sharedMockCache.getDeviceById.mockImplementation(() => { throw new (class extends Error { })(); });
    const result = await accessory.getOn();
    expect(mockPlatform.log.error).toHaveBeenCalled();
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
    expect(result).toBe(false);
  });

  it('getOn: should return correct value for udm with ledSettings.enabled true/false', async () => {
    const udmOn = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: { enabled: true } };
    sharedMockCache.getDeviceById.mockReturnValue(udmOn);
    let result = await accessory.getOn();
    expect(result).toBe(true);
    const udmOff = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: { enabled: false } };
    sharedMockCache.getDeviceById.mockReturnValue(udmOff);
    result = await accessory.getOn();
    expect(result).toBe(false);
  });

  it('getOn: should return correct value for uap with led_override on/off', async () => {
    const uapOn = { ...mockAccessory.context.accessPoint, type: 'uap', led_override: 'on' };
    sharedMockCache.getDeviceById.mockReturnValue(uapOn);
    let result = await accessory.getOn();
    expect(result).toBe(true);
    const uapOff = { ...mockAccessory.context.accessPoint, type: 'uap', led_override: 'off' };
    sharedMockCache.getDeviceById.mockReturnValue(uapOff);
    result = await accessory.getOn();
    expect(result).toBe(false);
  });

  it('should set all AccessoryInformation characteristics when service is present', () => {
    const infoService = {
      setCharacteristic: vi.fn().mockReturnThis(),
    };
    const accessoryWithInfo = {
      ...mockAccessory,
      getService: vi.fn((svc) => svc === mockPlatform.Service.AccessoryInformation ? infoService : mockService),
    };
    new UniFiAP(mockPlatform as any as UnifiAPLight, accessoryWithInfo as any as PlatformAccessory);
    expect(infoService.setCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.Manufacturer, 'Ubiquiti');
    expect(infoService.setCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.Model, mockAccessory.context.accessPoint.model);
    expect(infoService.setCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.SerialNumber, mockAccessory.context.accessPoint.serial);
    expect(infoService.setCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.FirmwareRevision, mockAccessory.context.accessPoint.version);
  });

  it('should not add Lightbulb service if already present', () => {
    const getServiceSpy = vi.fn(() => mockService);
    const addServiceSpy = vi.fn(() => mockService);
    const accessoryWithLightbulb = { ...mockAccessory, getService: getServiceSpy, addService: addServiceSpy };
    new UniFiAP(mockPlatform as any as UnifiAPLight, accessoryWithLightbulb as any as PlatformAccessory);
    expect(getServiceSpy).toHaveBeenCalledWith(mockPlatform.Service.Lightbulb);
    expect(addServiceSpy).not.toHaveBeenCalled();
  });

  it('should use context accessPoint if device not found in cache (constructor)', () => {
    const contextDevice = { ...mockAccessory.context.accessPoint, name: 'Context AP', _id: 'context1' };
    const contextAccessory = { ...mockAccessory, context: { accessPoint: contextDevice } };
    const platformWithEmptyCache = {
      ...mockPlatform,
      getDeviceCache: () => ({
        getDeviceById: vi.fn(() => undefined),
        getAllDevices: vi.fn(() => []),
        setDevices: vi.fn(),
      }),
    };
    const instance = new UniFiAP(platformWithEmptyCache as any as UnifiAPLight, contextAccessory as any as PlatformAccessory);
    expect(instance.accessPoint).toBe(contextDevice);
  });

  it('setOn: should handle UnifiApiError and set Not Responding', async () => {
    class UnifiApiError extends Error { constructor(msg: string) { super(msg); } }
    mockPlatform.sessionManager.request.mockRejectedValueOnce(new UnifiApiError('api error'));
    await accessory.setOn(true);
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('api error'));
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
  });

  it('setOn: should handle UnifiNetworkError and set Not Responding', async () => {
    class UnifiNetworkError extends Error { constructor(msg: string) { super(msg); } }
    mockPlatform.sessionManager.request.mockRejectedValueOnce(new UnifiNetworkError('network error'));
    await accessory.setOn(true);
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('network error'));
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
  });

  it('setOn: should not throw if udm has no ledSettings', async () => {
    const udm = { ...mockAccessory.context.accessPoint, type: 'udm' };
    sharedMockCache.getDeviceById.mockReturnValue(udm);
    accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory);
    await expect(accessory.setOn(true)).resolves.not.toThrow();
  });

  it('getOn: should handle UnifiAuthError and set Not Responding', async () => {
    class UnifiAuthError extends Error { constructor(msg: string) { super(msg); } }
    sharedMockCache.getDeviceById.mockImplementation(() => { throw new UnifiAuthError('auth error'); });
    const result = await accessory.getOn();
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('auth error'));
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
    expect(result).toBe(false);
  });

  it('getOn: should handle UnifiApiError and set Not Responding', async () => {
    class UnifiApiError extends Error { constructor(msg: string) { super(msg); } }
    sharedMockCache.getDeviceById.mockImplementation(() => { throw new UnifiApiError('api error'); });
    const result = await accessory.getOn();
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('api error'));
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
    expect(result).toBe(false);
  });

  it('getOn: should handle UnifiNetworkError and set Not Responding', async () => {
    class UnifiNetworkError extends Error { constructor(msg: string) { super(msg); } }
    sharedMockCache.getDeviceById.mockImplementation(() => { throw new UnifiNetworkError('network error'); });
    const result = await accessory.getOn();
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('network error'));
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
    expect(result).toBe(false);
  });

  it('getOn: should log error and set Not Responding if udm has no ledSettings', async () => {
    const udm = { ...mockAccessory.context.accessPoint, type: 'udm' };
    sharedMockCache.getDeviceById.mockReturnValue(udm);
    const result = await accessory.getOn();
    expect(mockPlatform.log.error).toHaveBeenCalledWith(expect.stringContaining('enabled'));
    expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'));
    expect(result).toBe(false);
  });
});
