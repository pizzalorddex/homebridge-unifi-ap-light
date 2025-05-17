import { vi } from 'vitest'
vi.mock('../../src/unifi', () => ({
	getAccessPoints: vi.fn()
}))
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UnifiAPLight } from '../../src/platform'
import { API, Logger, PlatformAccessory } from 'homebridge'
import { DeviceCache } from '../../src/cache/deviceCache.js'
import { SessionManager } from '../../src/sessionManager.js'
import * as unifi from '../../src/unifi'
import { UnifiApiError, UnifiAuthError, UnifiNetworkError } from '../../src/models/unifiTypes.js'
import { PLUGIN_NAME, PLATFORM_NAME } from '../../src/settings.js'
import { createMockApi, mockLogger } from '../fixtures/homebridgeMocks.js'
import * as accessoryFactory from '../../src/accessoryFactory.js'

// Mocks
const validConfig = {
	platform: PLUGIN_NAME,
	name: 'Test Platform',
	host: 'localhost',
	username: 'user',
	password: 'pass',
	sites: ['default'],
}

// --- Platform Initialization & Config Validation ---
describe('UnifiAPLight Platform Initialization and Config Validation', () => {
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

// --- Device Discovery and Accessory Management ---
describe('Device Discovery and Accessory Management', () => {
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

	// Config validation edge cases
	it('should throw config errors for all invalid config fields', () => {
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, sites: 'not-array' }, mockApi as any as API)).toThrow('sites')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, includeIds: 'not-array' }, mockApi as any as API)).toThrow('includeIds')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, excludeIds: 'not-array' }, mockApi as any as API)).toThrow('excludeIds')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, refreshIntervalMinutes: 0 }, mockApi as any as API)).toThrow('refreshIntervalMinutes')
		expect(() => new UnifiAPLight(mockLogger as any as Logger, { ...validConfig, refreshIntervalMinutes: 'bad' }, mockApi as any as API)).toThrow('refreshIntervalMinutes')
	})

	it('throws and logs config errors for malformed config fields', async () => {
		const configs = [
			{ platform: PLUGIN_NAME, host: 123, username: 'u', password: 'p' },
			{ platform: PLUGIN_NAME, host: 'h', username: 123, password: 'p' },
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 123 },
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', sites: 123 },
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', includeIds: 123 },
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', excludeIds: 123 },
			{ platform: PLUGIN_NAME, host: 'h', username: 'u', password: 'p', refreshIntervalMinutes: 'bad' },
		]
		for (const config of configs) {
			expect(() => new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any)).toThrow()
			expect(mockLogger.error).toHaveBeenCalled()
		}
	})

	// Error handling for discoverDevices
	it('handles UnifiAuthError', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockRejectedValueOnce(new UnifiAuthError('fail'))
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'))
	})

	it('handles generic error', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockRejectedValueOnce(new Error('fail'))
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected error'))
	})

	it('logs error for unknown error type in discoverDevices', async () => {
		const orig = platform.sessionManager.authenticate
		platform.sessionManager.authenticate = vi.fn(() => { throw { foo: 'bar' } }) as any
		mockLogger.error.mockClear()
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith(
			'Unexpected error during authentication: [object Object]'
		)
		platform.sessionManager.authenticate = orig
	})

	it('logs error for AxiosError in discoverDevices', async () => {
		const axiosError = new Error('axios fail')
		platform.sessionManager.authenticate = vi.fn(() => { throw axiosError }) as any
		mockLogger.error.mockClear()
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith('Unexpected error during authentication: axios fail')
	})

	// Site logic
	it('aborts if no valid sites', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(sessionManager, 'getSiteName').mockReturnValue(undefined)
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No valid sites'))
	})

	it('warns if no access points', async () => {
		vi.spyOn(sessionManager, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(sessionManager, 'getSiteName').mockReturnValue('default')
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValueOnce([])
		await platform.discoverDevices()
		expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No access points discovered. Check your site configuration and permissions.'))
	})

	it('warns for unrecognized site names during discovery', async () => {
		// Setup config with one recognized and one unrecognized site
		const config = { ...validConfig, sites: ['default', 'unknownSite'] }
		platform = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		// Attach spies to the new platform's sessionManager and unifi
		vi.spyOn(platform.sessionManager, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(platform.sessionManager, 'getSiteName').mockImplementation(site => site === 'default' ? 'default' : undefined)
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValueOnce([])
		mockLogger.warn.mockClear()
		mockLogger.error.mockClear()
		await platform.discoverDevices()
		expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No access points discovered. Check your site configuration and permissions.'))
	})

	it('handles multiple devices and sites', async () => {
		const config = { ...validConfig, sites: ['default', 'site2'], includeIds: ['id1', 'id2'] }
		platform = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		vi.spyOn(platform.sessionManager, 'authenticate').mockResolvedValue(undefined)
		vi.spyOn(platform.sessionManager, 'getSiteName').mockImplementation(site => {
			if (site === 'default') {
				return 'default'
			}
			if (site === 'site2') {
				return 'site2'
			}
			return undefined
		})
		const apsDefault = [
			{ _id: 'id1', name: 'AP1', type: 'uap', site: 'default', model: 'UAP', serial: 'SN1', version: 'v', mac: '00:11:22:33:44:55', adopted: true, state: 1 }
		]
		const apsSite2 = [
			{ _id: 'id2', name: 'AP2', type: 'uap', site: 'site2', model: 'UAP', serial: 'SN2', version: 'v', mac: '00:11:22:33:44:56', adopted: true, state: 1 }
		]
		vi.spyOn(unifi, 'getAccessPoints').mockImplementation(() => {
			return Promise.resolve([...apsDefault, ...apsSite2])
		})
		await Promise.all(
			mockApi.on.mock.calls
				.filter(([event]) => event === 'didFinishLaunching')
				.map(([, handler]) => handler.call(platform))
		)
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(platform.accessories.length).toBe(2)
		expect(platform.accessories.map(a => a.displayName)).toEqual(['AP1', 'AP2'])
	})

	it('logs error and returns if all sites are unrecognized during discovery', async () => {
		vi.spyOn(SessionManager.prototype, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue(undefined)
		const config = { ...validConfig, sites: ['unknownSite'] }
		platform = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		mockLogger.error.mockClear()
		await platform.discoverDevices()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No valid sites resolved. Aborting discovery.'))
	})

	// Accessory management logic
	it('adds, restores, and removes accessories', async () => {
		let RealPlatformAccessory: any
		try {
			RealPlatformAccessory = require('homebridge/lib/platformAccessory').PlatformAccessory
			if (typeof RealPlatformAccessory !== 'function' || !RealPlatformAccessory.prototype) {
				throw new Error('Real PlatformAccessory is not a class')
			}
		} catch (e) {
			throw new Error('Test requires the real homebridge PlatformAccessory class. Patch the require path or install homebridge as a devDependency. Error: ' + e)
		}
		mockApi.platformAccessory = RealPlatformAccessory
		const registerSpy = vi.fn()
		mockApi.registerPlatformAccessories = registerSpy
		const unregisterSpy = mockApi.unregisterPlatformAccessories
		const ap = { _id: 'id1', name: 'AP1', type: 'uap', site: 'default', model: 'UAP', serial: 'SN12345', version: 'v', mac: '00:11:22:33:44:55' }
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValue([ap])
		vi.spyOn(SessionManager.prototype, 'authenticate').mockResolvedValue(undefined)
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const platform = new UnifiAPLight(mockLogger as any, { ...validConfig }, mockApi)
		expect(platform.api).toBe(mockApi)
		platform.getDeviceCache().clear()
		await Promise.all(
			mockApi.on.mock.calls
				.filter(([event]) => event === 'didFinishLaunching')
				.map(([, handler]) => handler.call(platform))
		)
		await new Promise(resolve => setTimeout(resolve, 0))
		mockLogger.info.mockClear()
		expect(platform.accessories.length).toBe(1)
		expect(platform.accessories[0].displayName).toBe(ap.name)
		expect(registerSpy).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [platform.accessories[0]])
		platform.config.excludeIds = [ap._id]
		const uuid = mockApi.hap.uuid.generate(ap._id)
		const accessory = new mockApi.platformAccessory(ap.name, uuid)
		accessory.context.accessPoint = ap
		platform.configureAccessory(accessory)
		const idx = platform.accessories.findIndex(a => a.UUID === uuid)
		if (idx !== -1) {
			platform.accessories.splice(idx, 1)
		}
		await Promise.all(
			mockApi.on.mock.calls
				.filter(([event]) => event === 'didFinishLaunching')
				.map(([, handler]) => handler.call(platform))
		)
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(unregisterSpy).toHaveBeenCalled()
		expect(platform.accessories.find(a => a.UUID === uuid)).toBeUndefined()
		platform.config.excludeIds = []
		platform.config.includeIds = [ap._id]
		platform.getDeviceCache().clear()
		platform.getDeviceCache().setDevices([ap])
		const restoredAccessory = new mockApi.platformAccessory(ap.name, uuid)
		restoredAccessory.context.accessPoint = ap
		platform.configureAccessory(restoredAccessory)
		await Promise.all(
			mockApi.on.mock.calls
				.filter(([event]) => event === 'didFinishLaunching')
				.map(([, handler]) => handler.call(platform))
		)
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Restoring existing accessory'))
		expect(platform.accessories.find(a => a.UUID === uuid)).toBeDefined()
		expect(platform.accessories.length).toBe(1)
	})

	it('calls removeAccessory if accessory is present and isExcluded', async () => {
		const ap = { _id: 'id1', name: 'AP1', type: 'uap', site: 'default', model: 'UAP', serial: 'SN', version: 'v', mac: '00:11:22:33:44:55' }
		const uuid = mockApi.hap.uuid.generate(ap._id)
		const accessory = { UUID: uuid, displayName: ap.name, context: { accessPoint: ap } } as any
		platform['_accessories'].push(accessory)
		platform.config.excludeIds = [ap._id]
		vi.spyOn(platform.sessionManager, 'authenticate').mockResolvedValue(undefined)
		vi.spyOn(platform.sessionManager, 'getSiteName').mockReturnValue('default')
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValue([ap])
		const removeSpy = vi.spyOn(accessoryFactory, 'removeAccessory')
		await platform.discoverDevices()
		expect(removeSpy).toHaveBeenCalledWith(platform, accessory)
	})

	it('calls restoreAccessory if accessory is present and isIncluded and not isExcluded', async () => {
		const ap = { _id: 'id3', name: 'AP3', type: 'uap', site: 'default', model: 'UAP', serial: 'SN', version: 'v', mac: '00:11:22:33:44:57' }
		const uuid = mockApi.hap.uuid.generate(ap._id)
		const accessory = { UUID: uuid, displayName: ap.name, context: { accessPoint: ap } } as any
		platform['_accessories'].push(accessory)
		platform.config.includeIds = [ap._id]
		platform.config.excludeIds = []
		vi.spyOn(platform.sessionManager, 'authenticate').mockResolvedValue(undefined)
		vi.spyOn(platform.sessionManager, 'getSiteName').mockReturnValue('default')
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValue([ap])
		const restoreSpy = vi.spyOn(accessoryFactory, 'restoreAccessory')
		await platform.discoverDevices()
		expect(restoreSpy).toHaveBeenCalledWith(platform, ap, accessory)
	})

	it('calls createAndRegisterAccessory if accessory is not present and isIncluded and not isExcluded', async () => {
		const ap = { _id: 'id4', name: 'AP4', type: 'uap', site: 'default', model: 'UAP', serial: 'SN', version: 'v', mac: '00:11:22:33:44:58' }
		const uuid = mockApi.hap.uuid.generate(ap._id)
		platform['_accessories'] = []
		platform.config.includeIds = [ap._id]
		platform.config.excludeIds = []
		vi.spyOn(platform.sessionManager, 'authenticate').mockResolvedValue(undefined)
		vi.spyOn(platform.sessionManager, 'getSiteName').mockReturnValue('default')
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValue([ap])
		const createSpy = vi.spyOn(accessoryFactory, 'createAndRegisterAccessory')
		await platform.discoverDevices()
		expect(createSpy).toHaveBeenCalledWith(platform, ap, uuid)
	})

	// Device cache refresh error handling
	it('logs error and returns if all sites are unrecognized during device cache refresh', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue(undefined)
		const config = { ...validConfig, sites: ['unknownSite'] }
		platform = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No valid sites resolved. Aborting device cache refresh.'))
	})

	it('handles UnifiAuthError in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiAuthError('auth fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiAuthError('auth fail'))
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh failed: Failed to detect UniFi API structure during authentication'))
	})

	it('handles UnifiApiError in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiApiError('api fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiApiError('api fail'))
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh failed: api fail'))
	})

	it('handles UnifiNetworkError in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiNetworkError('network fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiNetworkError('network fail'))
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh failed: network fail'))
	})

	it('handles generic Error in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce(new Error('generic fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new Error('generic fail'))
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh failed: generic fail'))
	})

	it('handles string error in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce('string fail')
		getAccessPointsSpy.mockRejectedValueOnce('string fail')
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith('Device cache refresh failed:', 'string fail')
	})

	it('handles object error in refreshDeviceCache', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		getAccessPointsSpy.mockRejectedValueOnce({ foo: 'bar' })
		getAccessPointsSpy.mockRejectedValueOnce({ foo: 'bar' })
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith('Device cache refresh failed:', { foo: 'bar' })
	})

	it('marks all accessories as Not Responding if device cache refresh fails', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		const accessory1 = { displayName: 'AP1', UUID: 'uuid-1', context: { accessPoint: { _id: 'id1' } }, getService: vi.fn(), addService: vi.fn() } as any
		const accessory2 = { displayName: 'AP2', UUID: 'uuid-2', context: { accessPoint: { _id: 'id2' } }, getService: vi.fn(), addService: vi.fn() } as any
		const mockService = { updateCharacteristic: vi.fn() }
		accessory1.getService.mockReturnValue(mockService)
		accessory2.getService.mockReturnValue(mockService)
		platform.configureAccessory(accessory1)
		platform.configureAccessory(accessory2)
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiApiError('api fail'))
		getAccessPointsSpy.mockRejectedValueOnce(new UnifiApiError('api fail'))
		await (platform as any).refreshDeviceCache()
		expect(mockService.updateCharacteristic).toHaveBeenCalledWith(platform.Characteristic.On, new Error('Not Responding'))
		expect(mockService.updateCharacteristic).toHaveBeenCalledTimes(2)
	})

	it('logs info on successful device cache refresh', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const ap = { _id: 'id1', name: 'AP1', type: 'uap', site: 'default', model: 'UAP', serial: 'SN', version: 'v', mac: '00:11:22:33:44:55' }
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints').mockResolvedValueOnce([ap])
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		mockLogger.info.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(getAccessPointsSpy).toHaveBeenCalled()
		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.stringContaining('Device cache refreshed. 1 devices currently available.')
		)
	})

	it('logs error if refreshDeviceCache throws null', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		getAccessPointsSpy.mockRejectedValueOnce(null)
		getAccessPointsSpy.mockRejectedValueOnce(null)
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith('Device cache refresh failed:', null)
	})

	it('logs error if refreshDeviceCache throws undefined', async () => {
		vi.spyOn(SessionManager.prototype, 'getSiteName').mockReturnValue('default')
		const getAccessPointsSpy = vi.spyOn(unifi, 'getAccessPoints')
		getAccessPointsSpy.mockRejectedValueOnce(undefined)
		getAccessPointsSpy.mockRejectedValueOnce(undefined)
		platform = new UnifiAPLight(mockLogger as any as Logger, validConfig, mockApi as any as API)
		mockLogger.error.mockClear()
		await (platform as any).refreshDeviceCache()
		expect(mockLogger.error).toHaveBeenCalledWith('Device cache refresh failed:', undefined)
	})
})

// --- Device Cache Refresh Timer Logic ---
describe('Device Cache Refresh Timer Logic', () => {
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
		const config = { ...validConfig } as any
		config.refreshIntervalMinutes = undefined
		const p = new UnifiAPLight(mockLogger as any as Logger, config, mockApi as any as API)
		expect((p as any).refreshIntervalMs).toBe(10 * 60 * 1000)
	})

	it('should throw if required config fields are missing', () => {
		const missingHost = { ...validConfig } as any
		missingHost.host = undefined
		const missingUser = { ...validConfig } as any
		missingUser.username = undefined
		const missingPass = { ...validConfig } as any
		missingPass.password = undefined
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

// --- Platform API: Getters and Logging ---
describe('Platform API: Getters and Logging', () => {
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

	it('logs debug/info and does not log warnings/errors on successful device discovery', async () => {
		vi.spyOn(platform.sessionManager, 'authenticate').mockResolvedValueOnce(undefined)
		vi.spyOn(platform.sessionManager, 'getSiteName').mockReturnValue('default')
		const ap = { _id: 'id1', name: 'AP1', type: 'uap', site: 'default', model: 'UAP', serial: 'SN', version: 'v', mac: '00:11:22:33:44:55', adopted: true, state: 1 }
		vi.spyOn(unifi, 'getAccessPoints').mockResolvedValueOnce([ap])
		mockLogger.debug.mockClear()
		mockLogger.info.mockClear()
		mockLogger.warn.mockClear()
		mockLogger.error.mockClear()
		await platform.discoverDevices()
		expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('No valid sites'))
		expect(mockLogger.warn).not.toHaveBeenCalled()
		expect(mockLogger.error).not.toHaveBeenCalled()
		// Optionally, check that debug/info was called for discovery
	})
})
