import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UnifiAPLight } from '../../src/platform.js'
import { DeviceCache } from '../../src/cache/deviceCache.js'
import { discoverDevices } from '../../src/platform/discovery.js'
import { mockLogger, mockApi, makeAccessory } from '../fixtures/homebridgeMocks'

// --- Mocks and Setup ---
const validConfig = {
	platform: 'unifi-ap-light',
	name: 'Test Platform',
	host: 'localhost',
	username: 'user',
	password: 'pass',
	sites: ['default'],
}

vi.mock('../../src/platform/discovery.js', () => ({
	discoverDevices: vi.fn()
}))

// --- Platform Tests ---
describe('UnifiAPLight Platform', () => {
	let platform: UnifiAPLight

	beforeEach(() => {
		platform = new UnifiAPLight(mockLogger as any, validConfig, mockApi as any)
		vi.clearAllMocks()
	})

	// --- Unit: validateConfig ---
	describe('validateConfig', () => {
		it('accepts valid config', () => {
			expect(() => (platform as any).validateConfig(validConfig)).not.toThrow()
		})
		it('throws for missing/invalid host', () => {
			expect(() => (platform as any).validateConfig({ ...validConfig, host: undefined })).toThrow('host')
		})
		it('throws for missing/invalid username', () => {
			expect(() => (platform as any).validateConfig({ ...validConfig, username: undefined })).toThrow('username')
		})
		it('throws for missing/invalid password', () => {
			expect(() => (platform as any).validateConfig({ ...validConfig, password: undefined })).toThrow('password')
		})
		it('throws for non-array sites', () => {
			expect(() => (platform as any).validateConfig({ ...validConfig, sites: 'not-array' })).toThrow('sites')
		})
		it('throws for non-array includeIds', () => {
			expect(() => (platform as any).validateConfig({ ...validConfig, includeIds: 'not-array' })).toThrow('includeIds')
		})
		it('throws for non-array excludeIds', () => {
			expect(() => (platform as any).validateConfig({ ...validConfig, excludeIds: 'not-array' })).toThrow('excludeIds')
		})
		it('throws for invalid refreshIntervalMinutes', () => {
			expect(() => (platform as any).validateConfig({ ...validConfig, refreshIntervalMinutes: 0 })).toThrow('refreshIntervalMinutes')
			expect(() => (platform as any).validateConfig({ ...validConfig, refreshIntervalMinutes: 'bad' })).toThrow('refreshIntervalMinutes')
		})
	})

	// --- Unit: Public API ---
	it('returns deviceCache from getDeviceCache', () => {
		expect(platform.getDeviceCache()).toBeInstanceOf(DeviceCache)
	})
	it('returns _accessories from accessories getter', () => {
		expect(Array.isArray(platform.accessories)).toBe(true)
	})

	// --- Integration: configureAccessory ---
	it('adds accessory to cache and logs info', () => {
		const accessory = makeAccessory('Test', 'ap-id') as any
		platform.configureAccessory(accessory)
		expect(platform.accessories).toContain(accessory)
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[Cache Restore] Registered cached accessory with Homebridge'))
	})

	// --- Integration: handleDidFinishLaunching ---
	it('calls discoverDevices and starts timer', () => {
		const spy = vi.spyOn(platform as any, 'startDeviceCacheRefreshTimer')
		;(platform as any).handleDidFinishLaunching()
		expect(discoverDevices).toHaveBeenCalledWith(platform)
		expect(spy).toHaveBeenCalled()
		expect(mockLogger.debug).toHaveBeenCalledWith('Finished loading, starting device discovery...')
	})

	// --- Integration: startDeviceCacheRefreshTimer ---
	it('starts and clears timer as expected', () => {
		const clearSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
		const setSpy = vi.spyOn(globalThis, 'setInterval') as any
		setSpy.mockImplementation(() => 456)
		;(platform as any).refreshTimer = 123 as any
		;(platform as any).startDeviceCacheRefreshTimer()
		expect(clearSpy).toHaveBeenCalled()
		expect(setSpy).toHaveBeenCalled()
		expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Device cache refresh timer started'))
		clearSpy.mockRestore()
		setSpy.mockRestore()
	})
	it('handles setInterval/clearInterval errors', () => {
		const clearSpy = vi.spyOn(global, 'clearInterval').mockImplementation(() => { throw new Error('fail') })
		const setSpy = vi.spyOn(global, 'setInterval').mockImplementation(() => { throw new Error('fail') })
		expect(() => (platform as any).startDeviceCacheRefreshTimer()).toThrow()
		clearSpy.mockRestore()
		setSpy.mockRestore()
	})

	// --- Integration: Public wrappers ---
	it('calls discoverDevices in public wrapper', async () => {
		await platform.discoverDevices()
		expect(discoverDevices).toHaveBeenCalledWith(platform)
	})
	it('calls DeviceCache.refreshDeviceCache in public wrapper', async () => {
		const spy = vi.spyOn(DeviceCache, 'refreshDeviceCache').mockResolvedValue(undefined)
		await platform.refreshDeviceCache()
		expect(spy).toHaveBeenCalledWith(platform)
		spy.mockRestore()
	})
	it('calls RecoveryManager.forceImmediateCacheRefresh in public wrapper', async () => {
		const recoveryManager = (platform as any).recoveryManager
		recoveryManager.forceImmediateCacheRefresh = vi.fn().mockResolvedValue(undefined)
		await platform.forceImmediateCacheRefresh()
		expect(recoveryManager.forceImmediateCacheRefresh).toHaveBeenCalled()
	})
})
