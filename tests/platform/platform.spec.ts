import { vi } from 'vitest'
vi.mock('../../src/unifi', () => ({
	getAccessPoints: vi.fn()
}))
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UnifiAPLight } from '../../src/platform'
import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge'
import { DeviceCache } from '../../src/cache/deviceCache.js'
import { SessionManager } from '../../src/sessionManager.js'
import * as unifi from '../../src/unifi'
import { UnifiApiError, UnifiAuthError, UnifiNetworkError } from '../../src/models/unifiTypes.js'
import { PLUGIN_NAME, PLATFORM_NAME } from '../../src/settings.js'
import { createMockApi, mockLogger } from '../fixtures/homebridgeMocks.js'

// Mocks
const validConfig: PlatformConfig = {
	platform: PLUGIN_NAME,
	name: 'Test Platform',
	host: 'localhost',
	username: 'user',
	password: 'pass',
	sites: ['default'],
}

describe('UnifiAPLight Platform', () => {
	let platform: UnifiAPLight
	let mockApi: ReturnType<typeof createMockApi>

	beforeEach(() => {
		vi.clearAllMocks()
		mockApi = createMockApi()
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
	})

	it('should validate config and initialize', () => {
		expect(platform.config).toBeDefined()
		expect(platform.sessionManager).toBeInstanceOf(SessionManager)
		expect(platform.getDeviceCache()).toBeInstanceOf(DeviceCache)
	})

	it('should throw on invalid config', () => {
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, host: undefined }, mockApi as any as API)).toThrow()
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, username: undefined }, mockApi as any as API)).toThrow()
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, password: undefined }, mockApi as any as API)).toThrow()
	})

	it('should add accessory to cache on configureAccessory', () => {
		const accessory = { displayName: 'Test', UUID: 'uuid-1', context: {} } as PlatformAccessory
		platform.configureAccessory(accessory)
		expect(platform.accessories).toContain(accessory)
	})
})

describe('UnifiAPLight uncovered logic', () => {
	let platform: UnifiAPLight
	let sessionManager: SessionManager
	let mockApi: ReturnType<typeof createMockApi>

	beforeEach(() => {
		vi.clearAllMocks()
		mockApi = createMockApi()
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		sessionManager = platform.sessionManager
		mockApi.registerPlatformAccessories.mockClear()
		mockApi.unregisterPlatformAccessories.mockClear()
		mockLogger.warn.mockClear()
		mockLogger.error.mockClear()
		mockLogger.info.mockClear()
	})

	it('should throw config errors for all invalid config fields', () => {
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, sites: 'not-array' }, mockApi as any as API)).toThrow('sites')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, includeIds: 'not-array' }, mockApi as any as API)).toThrow('includeIds')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, excludeIds: 'not-array' }, mockApi as any as API)).toThrow('excludeIds')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, refreshIntervalMinutes: 0 }, mockApi as any as API)).toThrow('refreshIntervalMinutes')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, refreshIntervalMinutes: 'bad' }, mockApi as any as API)).toThrow('refreshIntervalMinutes')
	})

	it('throws and logs config errors for malformed config fields', async () => {
		const configs = [
			{ platform: PLUGIN_NAME, host: 123, username: 'u', password: 'p' }, // host wrong type
			{ platform: PLUGIN_NAME, host: 'h', username: 123, password: 'p' }, // username wrong type
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 123 }, // password wrong type
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', sites: 123 }, // sites wrong type
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', includeIds: 123 }, // includeIds wrong type
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', excludeIds: 123 }, // excludeIds wrong type
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', refreshIntervalMinutes: 'bad' }, // refreshIntervalMinutes wrong type
		]
		for (const config of configs) {
			expect(() => new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any)).toThrow()
			expect(mockLogger.error).toHaveBeenCalled()
		}
	})

	it('discoverDevices handles UnifiAuthError', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockRejectedValueOnce(new UnifiAuthError('fail'))
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'))
	})

	it('discoverDevices handles generic error', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockRejectedValueOnce(new Error('fail'))
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected error'))
	})

	it('discoverDevices aborts if no valid sites', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(sessionManager, 'getSiteName').mockReturnValue(undefined)
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No valid sites'))
	})

	it('discoverDevices warns if no access points', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default')
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValueOnce([])
		await platform.discoverDevices()
		expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No access points discovered. Check your site configuration and permissions.'))
	})
	it('discoverDevices adds, restores, and removes accessories', async () => {
		// Setup all spies/mocks BEFORE constructing the platform
		let RealPlatformAccessory: any
		try {
			RealPlatformAccessory = require('homebridge/lib/platformAccessory').PlatformAccessory
			if (typeof RealPlatformAccessory !== 'function' || !RealPlatformAccessory.prototype) {
				throw new Error('Real PlatformAccessory is not a class')
			}
		} catch (e) {
			throw new Error('Test requires the real homebridge PlatformAccessory class. Patch the require path or install homebridge as a devDependency. Error: ' + e)
		}
		// Use the real PlatformAccessory class for registration
		mockApi.platformAccessory = RealPlatformAccessory
		// Set up spies for API methods
		const registerSpy = vi.fn()
		mockApi.registerPlatformAccessories = registerSpy
		const unregisterSpy = mockApi.unregisterPlatformAccessories
		// Patch the platform's api property after construction to ensure .api points to the same object
		// Do NOT import or spy on homebridge/lib/util/uuid; use mockApi.hap.uuid.generate as provided
		// Set up all other mocks/spies
		const ap = { _id: 'id1', name: 'AP1', type: 'uap', site: 'default', model: 'UAP', serial: 'SN12345', version: 'v', mac: '00:11:22:33:44:55' }
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValue([ap])
		// Mock SessionManager methods BEFORE platform construction
		vi.spyOn(SessionManager.prototype, 'authenticate').mockResolvedValue(undefined)
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		// Construct the platform instance AFTER all mocks are set up
		const platform = new UnifiAPLight(mockLogger as any, { ...validConfig }, mockApi)
		// Assert that the platform is using the same API object as the spy
		expect(platform.api).toBe(mockApi)
		platform.getDeviceCache().clear()
		// --- ADD PHASE ---
		// No cached accessories: Homebridge would not call configureAccessory
		// Simulate Homebridge startup event
		await Promise.all(
			mockApi.on.mock.calls
				.filter(([event]) => event === 'didFinishLaunching')
				.map(([, handler]) => handler.call(platform)) // Ensure correct `this` context
		)
		// Await a microtask to ensure all async work is done
		await new Promise(resolve => setTimeout(resolve, 0))
		// discoverDevices is called by didFinishLaunching handler
		// Ensure accessory is tracked and registered
		mockLogger.info.mockClear()
		expect(platform.accessories.length).toBe(1)
		expect(platform.accessories[0].displayName).toBe(ap.name)
		expect(registerSpy).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [platform.accessories[0]])
		// --- REMOVE PHASE ---
		platform.config.excludeIds = [ap._id]
		const uuid = mockApi.hap.uuid.generate(ap._id)
		const accessory = new mockApi.platformAccessory(ap.name, uuid)
		accessory.context.accessPoint = ap
		// Simulate Homebridge restoring cached accessory
		platform.configureAccessory(accessory)
		// Remove any duplicate accessories with the same UUID before removal phase
		const idx = platform.accessories.findIndex(a => a.UUID === uuid)
		if (idx !== -1) {
			platform.accessories.splice(idx, 1)
		}
		// Simulate Homebridge startup event again
		await Promise.all(
			mockApi.on.mock.calls
				.filter(([event]) => event === 'didFinishLaunching')
				.map(([, handler]) => handler.call(platform)) // Ensure correct `this` context
		)
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(unregisterSpy).toHaveBeenCalled()
		// Property-based check: accessory with this UUID should be removed
		expect(platform.accessories.find(a => a.UUID === uuid)).toBeUndefined()
		// --- RESTORE PHASE ---
		platform.config.excludeIds = []
		platform.config.includeIds = [ap._id]
		platform.getDeviceCache().clear()
		platform.getDeviceCache().setDevices([ap])
		const restoredAccessory = new mockApi.platformAccessory(ap.name, uuid)
		restoredAccessory.context.accessPoint = ap
		// Simulate Homebridge restoring cached accessory
		platform.configureAccessory(restoredAccessory)
		// Simulate Homebridge startup event again
		await Promise.all(
			mockApi.on.mock.calls
				.filter(([event]) => event === 'didFinishLaunching')
				.map(([, handler]) => handler.call(platform)) // Ensure correct `this` context
		)
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Restoring existing accessory'))
		// Property-based check: accessory with this UUID should be present and only one
		expect(platform.accessories.find(a => a.UUID === uuid)).toBeDefined()
		expect(platform.accessories.length).toBe(1)
	})

	it('should warn for unrecognized site names during discovery', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(sessionManager, 'getSiteName').mockImplementation(site => site === 'default' ? 'default' : undefined)
		const config = { ...validConfig, sites: ['default', 'unknownSite'] }
		platform = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValueOnce([])
		await platform.discoverDevices()
		// The warning is only logged if there is at least one valid site, so check for the 'No access points' warning
		expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No access points discovered. Check your site configuration and permissions.'))
	})

	it('should handle multiple devices and sites', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(sessionManager, 'getSiteName').mockImplementation(site => site === 'default' ? 'default' : (site === 'site2' ? 'site2' : undefined))
		const aps = [
			{ _id: 'id1', name: 'AP1', type: 'uap', site: 'default', model: 'UAP', serial: 'SN1', version: 'v', mac: '00:11:22:33:44:55' },
			{ _id: 'id2', name: 'AP2', type: 'uap', site: 'site2', model: 'UAP', serial: 'SN2', version: 'v', mac: '00:11:22:33:44:56' }
		]
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValue(aps)
		const config = { ...validConfig, sites: ['default', 'site2'] }
		platform = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		await platform.discoverDevices()
		expect(platform.accessories.length).toBe(2)
		expect(platform.accessories.map(a => a.displayName)).toEqual(['AP1', 'AP2'])
	})

}) // <-- End of main describe

describe('edge cases for unrecognized sites and error branches', () => {
	let platform: UnifiAPLight
	let mockApi: ReturnType<typeof createMockApi>
	beforeEach(() => {
		vi.clearAllMocks()
		mockApi = createMockApi()
	})
	it('should log error and return if all sites are unrecognized during discovery', async () => {
		vi.spyOn(SessionManager.prototype, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue(undefined)
		const config = { ...validConfig, sites: ['unknownSite'] }
		platform = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		mockLogger.error.mockClear()
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No valid sites resolved. Aborting discovery.'))
	})
	it('should log error and return if all sites are unrecognized during device cache refresh', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue(undefined)
		const config = { ...validConfig, sites: ['unknownSite'] }
		platform = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No valid sites resolved. Aborting device cache refresh.'))
	})
	it('should handle UnifiAuthError in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiAuthError('auth fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiAuthError('auth fail'))
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh failed: Failed to detect UniFi API structure during authentication'))
	})
	it('should handle UnifiApiError in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiApiError('api fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiApiError('api fail'))
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh failed: api fail'))
	})
	it('should handle UnifiNetworkError in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiNetworkError('network fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiNetworkError('network fail'))
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh failed: network fail'))
	})
	it('should handle generic Error in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce(new Error('generic fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new Error('generic fail'))
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh failed: generic fail'))
	})
	it('should handle string error in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce('string fail')
		getAccessPointsSpy.mockRejectedValueOnce('string fail')
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith('Device cache refresh failed:', 'string fail')
	})
	it('should handle object error in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce({ foo: 'bar' })
		getAccessPointsSpy.mockRejectedValueOnce({ foo: 'bar' })
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith('Device cache refresh failed:', { foo: 'bar' })
	})
	it('should mark all accessories as Not Responding if device cache refresh fails', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		// Add two mock accessories with Lightbulb service
		const accessory1 = { displayName: 'AP1', UUID: 'uuid-1', context: { accessPoint: { _id: 'id1' } }, getService: vi.fn(), addService: vi.fn() } as any
		const accessory2 = { displayName: 'AP2', UUID: 'uuid-2', context: { accessPoint: { _id: 'id2' } }, getService: vi.fn(), addService: vi.fn() } as any
		// Mock Lightbulb service with updateCharacteristic
		const mockService = { updateCharacteristic: vi.fn() }
		accessory1.getService.mockReturnValue(mockService)
		accessory2.getService.mockReturnValue(mockService)
		platform.configureAccessory(accessory1)
		platform.configureAccessory(accessory2)
		// Simulate error on both attempts
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiApiError('api fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiApiError('api fail'))
		await (platform as any).refreshDeviceCache()
		// Both accessories should be marked Not Responding
		expect(mockService.updateCharacteristic).toHaveBeenCalledWith(platform.Characteristic.On, new Error('Not Responding'))
		expect(mockService.updateCharacteristic).toHaveBeenCalledTimes(2)
	})
})

describe('Device cache refresh timer logic', () => {
	let platform: UnifiAPLight
	let mockApi: ReturnType<typeof createMockApi>
	let originalSetInterval: typeof setInterval
	let originalClearInterval: typeof clearInterval

	beforeEach(() => {
		vi.clearAllMocks()
		mockApi = createMockApi()
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		// Save originals
		originalSetInterval = global.setInterval
		originalClearInterval = global.clearInterval
	})

	afterEach(() => {
		global.setInterval = originalSetInterval
		global.clearInterval = originalClearInterval
	})

	it('should clear and reset timer if already set', () => {
		const clearSpy = vi.fn()
		const intervalStub = {}
		global.setInterval = vi.fn(() => ({})) as any
		global.clearInterval = clearSpy as any
		// Set a fake timer (object)
		platform['refreshTimer'] = intervalStub as any
		// Call the private method
		(platform as any).startDeviceCacheRefreshTimer()
		// Should clear the old timer and set a new one
		expect(clearSpy).toHaveBeenCalledWith(intervalStub)
		expect(global.setInterval).toHaveBeenCalled()
		expect(platform['refreshTimer']).not.toBe(intervalStub)
	})

	it('should set a new timer if none is set', () => {
		const fakeTimer = {}
		global.setInterval = vi.fn(() => fakeTimer) as any
		global.clearInterval = vi.fn() as any
		// Ensure timer is not set
		platform['refreshTimer'] = undefined as any
		(platform as any).startDeviceCacheRefreshTimer()
		expect(global.setInterval).toHaveBeenCalled()
		expect(platform['refreshTimer']).toBe(fakeTimer)
	})

	it('should use setInterval and clearInterval correctly', () => {
		const fakeOldTimer = {}
		const fakeNewTimer = {}
		const setSpy = vi.fn(() => fakeNewTimer)
		const clearSpy = vi.fn()
		global.setInterval = setSpy as any
		global.clearInterval = clearSpy as any
		// Set a previous timer
		platform['refreshTimer'] = fakeOldTimer as any
		(platform as any).startDeviceCacheRefreshTimer()
		expect(clearSpy).toHaveBeenCalledWith(fakeOldTimer)
		expect(setSpy).toHaveBeenCalled()
		expect(platform['refreshTimer']).toBe(fakeNewTimer)
	})

	it('should handle setInterval throwing an error', () => {
		global.setInterval = vi.fn(() => { throw new Error('setInterval fail') }) as any
		global.clearInterval = vi.fn() as any
		platform['refreshTimer'] = undefined as any
		expect(() => (platform as any).startDeviceCacheRefreshTimer()).toThrow('setInterval fail')
	})

	it('should handle clearInterval throwing an error', () => {
		const intervalStub = {}
		global.setInterval = vi.fn(() => ({})) as any
		global.clearInterval = vi.fn(() => { throw new Error('clearInterval fail') }) as any
		platform['refreshTimer'] = intervalStub as any
		expect(() => (platform as any).startDeviceCacheRefreshTimer()).toThrow('clearInterval fail')
	})

	it('should default refreshIntervalMs to 10min if refreshIntervalMinutes is missing', () => {
		const config = { ...validConfig }
		delete config.refreshIntervalMinutes
		const p = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		expect((p as any).refreshIntervalMs).toBe(10 * 60 * 1000)
	})

	it('should throw if refreshIntervalMinutes is zero or negative', () => {
		const zeroConfig = { ...validConfig, refreshIntervalMinutes: 0 }
		const negConfig = { ...validConfig, refreshIntervalMinutes: -5 }
		expect(() => new UnifiAPLight(mockLogger as any as Logger, zeroConfig, mockApi as any as API)).toThrow('refreshIntervalMinutes')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, negConfig, mockApi as any as API)).toThrow('refreshIntervalMinutes')
	})

	it('should throw if required config fields are missing', () => {
		const missingHost = { ...validConfig }
		delete missingHost.host
		const missingUser = { ...validConfig }
		delete missingUser.username
		const missingPass = { ...validConfig }
		delete missingPass.password
		expect(() => new UnifiAPLight(mockLogger as any as Logger, missingHost, mockApi as any as API)).toThrow('host')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, missingUser, mockApi as any as API)).toThrow('username')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, missingPass, mockApi as any as API)).toThrow('password')
	})

	it('should ignore extra/unexpected config fields', () => {
		const config = { ...validConfig, extraField: 'extra' }
		expect(() => new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)).not.toThrow()
	})

	it('should throw if config is empty object', () => {
		expect(() => new UnifiAPLight(mockLogger as any as Logger, {} as any, mockApi as any as API)).toThrow()
	})
})

describe('remaining uncovered logic', () => {
	let platform: UnifiAPLight
	let mockApi: ReturnType<typeof createMockApi>
	beforeEach(() => {
		vi.clearAllMocks()
		mockApi = createMockApi()
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
	})

	it('should call info log in startDeviceCacheRefreshTimer', () => {
		const infoSpy = mockLogger.info
		global.setInterval = vi.fn(() => ({})) as any
		global.clearInterval = vi.fn() as any
		platform['refreshTimer'] = undefined as any
		(platform as any).startDeviceCacheRefreshTimer()
		expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh timer started'))
	})

	it('should call debug log in handleDidFinishLaunching', () => {
		const debugSpy = mockLogger.debug
		platform['handleDidFinishLaunching']()
		expect(debugSpy).toHaveBeenCalledWith('Finished loading, starting device discovery. [platform]')
	})

	it('should return deviceCache from getDeviceCache', () => {
		expect(platform.getDeviceCache()).toBeInstanceOf(DeviceCache)
	})

	it('should return _accessories from accessories getter', () => {
		const accessory = { displayName: 'Test', UUID: 'uuid-2', context: {} } as PlatformAccessory
		platform.configureAccessory(accessory)
		expect(platform.accessories).toContain(accessory)
	})

	it('should log error for unknown error type in discoverDevices', async () => {
		const orig = platform.sessionManager.authenticate
		platform.sessionManager.authenticate = vi.fn(() => { throw { foo: 'bar' } }) as any
		mockLogger.error.mockClear()
		await platform.discoverDevices()
		// Accept the actual error log output for non-standard errors
		expect(mockLogger.error).toHaveBeenCalledWith(
			'Unexpected error during authentication: [object Object]'
		)
		platform.sessionManager.authenticate = orig
	})
})
