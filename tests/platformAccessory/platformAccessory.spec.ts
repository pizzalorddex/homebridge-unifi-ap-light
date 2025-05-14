import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UniFiAP } from '../../src/platformAccessory.js';
import { UnifiAPLight } from '../../src/platform.js';
import { PlatformAccessory, Service } from 'homebridge';

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
});
