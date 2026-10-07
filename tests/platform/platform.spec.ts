import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UnifiAPLight } from '../../src/platform.js'
import { DeviceCache } from '../../src/cache/deviceCache.js'
import { discoverDevices } from '../../src/platform/discovery.js'
import { mockLogger, mockApi, makeAccessory, createMockApi } from '../fixtures/homebridgeMocks.js'

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

describe('UnifiAPLight Platform', () => {
	let platform: UnifiAPLight

	beforeEach(() => {
		vi.useFakeTimers()
		platform = new UnifiAPLight(mockLogger as any, validConfig, mockApi as any)
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it.each([undefined, {}, { ...validConfig, password: '' }])('stays idle with incomplete configuration: %j', config => {
		const api = createMockApi()
		expect(() => new UnifiAPLight(mockLogger as any, config as any, api)).not.toThrow()
		expect(api.on).not.toHaveBeenCalled()
		expect(discoverDevices).not.toHaveBeenCalled()
		expect(vi.getTimerCount()).toBe(0)
	})

	it('clears the refresh timer when Homebridge shuts down', () => {
		const api = createMockApi()
		const instance = new UnifiAPLight(mockLogger as any, validConfig, api)
		;(instance as any).handleDidFinishLaunching()
		expect(vi.getTimerCount()).toBe(1)
		const shutdown = api.on.mock.calls.find(([event]: [string]) => event === 'shutdown')![1]
		shutdown()
		expect(vi.getTimerCount()).toBe(0)
	})

	it('logs a rejected startup discovery without an unhandled rejection', async () => {
		vi.mocked(discoverDevices).mockRejectedValueOnce(new Error('startup discovery failed'))
		;(platform as any).handleDidFinishLaunching()
		await vi.advanceTimersByTimeAsync(0)
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('startup discovery failed'))
	})

	it('logs a rejected periodic refresh without an unhandled rejection', async () => {
		vi.spyOn(DeviceCache, 'refreshDeviceCache').mockRejectedValueOnce(new Error('periodic refresh failed'))
		;(platform as any).startDeviceCacheRefreshTimer()
		await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('periodic refresh failed'))
	})

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

	it('returns deviceCache from getDeviceCache', () => {
		expect(platform.getDeviceCache()).toBeInstanceOf(DeviceCache)
	})
	it('returns _accessories from accessories getter', () => {
		expect(Array.isArray(platform.accessories)).toBe(true)
	})

	it('adds accessory to cache and logs info', () => {
		const accessory = makeAccessory('Test', 'ap-id') as any
		platform.configureAccessory(accessory)
		expect(platform.accessories).toContain(accessory)
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[Cache Restore] Registered cached accessory with Homebridge'))
	})

	it('calls discoverDevices and starts timer', () => {
		const spy = vi.spyOn(platform as any, 'startDeviceCacheRefreshTimer')
		;(platform as any).handleDidFinishLaunching()
		expect(discoverDevices).toHaveBeenCalledWith(platform)
		expect(spy).toHaveBeenCalled()
		expect(mockLogger.debug).toHaveBeenCalledWith('Finished loading, starting device discovery...')
	})

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
