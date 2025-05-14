import { vi } from 'vitest';

// Homebridge API mock for use in tests
export const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

export const mockPlatformAccessory = (context = {}) => ({
  context,
  getService: vi.fn(),
  addService: vi.fn(),
  UUID: 'mock-uuid',
  displayName: 'Mock Accessory',
});

export const mockApi = {
  hap: {
    Service: {},
    Characteristic: {},
    uuid: { generate: vi.fn((id) => `uuid-${id}`) },
  },
  platformAccessory: vi.fn((name, uuid) => ({ context: {}, UUID: uuid, displayName: name })),
  unregisterPlatformAccessories: vi.fn(),
  registerPlatformAccessories: vi.fn(),
  on: vi.fn(),
};
