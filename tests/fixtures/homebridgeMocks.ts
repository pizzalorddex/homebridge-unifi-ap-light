import { vi } from 'vitest'
import * as HAP from 'hap-nodejs'
import * as HAPLegacyTypes from 'hap-nodejs/dist/accessories/types'
// Import the real PlatformAccessory class from Homebridge (CJS interop)
const { PlatformAccessory } = require('homebridge/lib/platformAccessory')

export function createMockApi(overrides = {}) {
	// Use the real HAP module for full compatibility, and use the real uuid.generate for valid UUIDs
	const hap = { ...HAP, uuid: { ...HAP.uuid, generate: HAP.uuid.generate } }
	const on = vi.fn()
	// Use vi.fn() for spies, and assign as properties (not methods)
	const registerPlatformAccessories = vi.fn()
	const unregisterPlatformAccessories = vi.fn()
	const updatePlatformAccessories = vi.fn()
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
	}
	return mockApi
}

export const mockLogger = {
	debug: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	info: vi.fn(),
}

export const mockLoggerFull = {
	debug: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	success: vi.fn(),
	log: vi.fn(),
}

export const mockLoggerInfoError = {
	info: vi.fn(),
	error: vi.fn(),
}

// --- Common Homebridge/Platform/Accessory/Service mocks for tests ---
export const mockService = {
	setCharacteristic: vi.fn().mockReturnThis(),
	getCharacteristic: vi.fn().mockReturnThis(),
	onSet: vi.fn().mockReturnThis(),
	onGet: vi.fn().mockReturnThis(),
	updateCharacteristic: vi.fn(),
}

export const mockAccessory = {
	getService: vi.fn(() => mockService),
	addService: vi.fn(() => mockService),
	context: { accessPoint: { _id: 'ap1', name: 'Test AP', type: 'uap', site: 'default', model: 'UAP-AC', serial: '123', version: '1.0.0', led_override: 'on' } },
	displayName: 'Test AP',
}

export function makeAccessory(name = 'Test', id = 'id') {
	return {
		...mockAccessory,
		displayName: name,
		context: { accessPoint: { ...mockAccessory.context.accessPoint, name, _id: id } },
	}
}

export function makeAccessoryWithUUID(name: string, id: string, uuid: string, contextOverride?: any) {
	return {
		...makeAccessory(name, id),
		UUID: uuid,
		...(contextOverride ? { context: contextOverride } : {}),
	}
}

export const sharedMockCache = {
	getDeviceById: vi.fn(() => mockAccessory.context.accessPoint),
	getAllDevices: vi.fn(() => [mockAccessory.context.accessPoint]),
	setDevices: vi.fn(),
	clear: vi.fn(),
}

export const mockPlatform = {
	getDeviceCache: () => sharedMockCache,
	config: { sites: ['default'] },
	sessionManager: { getApiHelper: () => ({ getDeviceUpdateEndpoint: vi.fn(() => '/api/s/default/rest/device/ap1') }), request: vi.fn().mockResolvedValue({ status: 200 }) },
	Service: { AccessoryInformation: {}, Lightbulb: {} },
	Characteristic: { Manufacturer: 'Manufacturer', Model: 'Model', SerialNumber: 'SerialNumber', FirmwareRevision: 'FirmwareRevision', Name: 'Name', On: 'On' },
	api: { hap: { uuid: { generate: vi.fn((id) => `uuid-${id}`) } } },
	log: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
	forceImmediateCacheRefresh: vi.fn().mockResolvedValue(undefined),
}

export const mockApi = {
	hap: { uuid: { generate: vi.fn(id => id) }, Service: {}, Characteristic: {} },
	on: vi.fn(),
	registerPlatformAccessories: vi.fn(),
	unregisterPlatformAccessories: vi.fn(),
}

/**
 * Generic mock for refreshDeviceCache (Promise<void> signature)
 */
export const mockRefreshDeviceCache: () => Promise<void> = vi.fn().mockResolvedValue(undefined)

export function makeSessionManager(overrides = {}) {
	return {
		authenticate: vi.fn().mockResolvedValue(undefined),
		getSiteName: vi.fn(site => site),
		getApiHelper: vi.fn(() => ({})),
		request: vi.fn(),
		...overrides,
	}
}

// --- Platform/Accessory/Discovery top-level mocks for tests ---
export const mockRestoreAccessory = vi.fn()
export const mockRemoveAccessory = vi.fn()
export const mockCreateAndRegisterAccessory = vi.fn()

export function createMockAccessoryList() {
	return [
		makeAccessoryWithUUID('AP1', 'uuid-1', 'uuid-1', { accessPoint: { _id: 'uuid-1' } }),
		makeAccessoryWithUUID('AP2', 'uuid-2', 'uuid-2', { accessPoint: { _id: 'uuid-2' } }),
	]
}
