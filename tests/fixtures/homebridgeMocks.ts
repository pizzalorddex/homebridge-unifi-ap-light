import { vi } from 'vitest';
import * as HAP from 'hap-nodejs';
import * as HAPLegacyTypes from 'hap-nodejs/dist/accessories/types';
// Import the real PlatformAccessory class from Homebridge (CJS interop)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PlatformAccessory } = require('homebridge/lib/platformAccessory');

export function createMockApi(overrides = {}) {
  // Use the real HAP module for full compatibility, and use the real uuid.generate for valid UUIDs
  const hap = { ...HAP, uuid: { ...HAP.uuid, generate: HAP.uuid.generate } };
  const on = vi.fn();
  // Use vi.fn() for spies, and assign as properties (not methods)
  const registerPlatformAccessories = vi.fn();
  const unregisterPlatformAccessories = vi.fn();
  const updatePlatformAccessories = vi.fn();
  // Return as plain properties, not bound methods
  const mockApi: any = {
    on,
    hap,
    hapLegacyTypes: HAPLegacyTypes,
    platformAccessory: PlatformAccessory, // Use the real class
    unregisterPlatformAccessories,
    registerPlatformAccessories,
    unregisterPlatformAccessoriesSpy: vi.fn(),
    registerPlatformAccessoriesSpy: vi.fn(),
    // Homebridge API required properties (stubs/dummies)
    version: 1.0, // should be a number, not string
    serverVersion: '1.0.0',
    user: {} as any, // <-- fix: make user compatible with type
    accessory: vi.fn(),
    bridge: vi.fn(),
    publishExternalAccessories: vi.fn(),
    unregisterPlatformAccessoriesByUUID: vi.fn(),
    updatePlatformAccessories,
    versionGreaterOrEqual: vi.fn(() => true),
    registerAccessory: vi.fn(),
    registerPlatform: vi.fn(),
    publishCameraAccessories: vi.fn(),
    // ...add more as needed for compatibility
    ...overrides,
  };
  return mockApi;
}

export const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};
