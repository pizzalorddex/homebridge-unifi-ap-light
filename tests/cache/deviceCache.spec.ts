import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DeviceCache } from '../../src/cache/deviceCache.js'
import { UnifiDevice } from '../../src/models/unifiTypes.js'
import { makeAccessory } from '../fixtures/homebridgeMocks'
import { setDevices, clear } from '../fixtures/deviceCacheMocks'

describe('DeviceCache', () => {
	let cache: DeviceCache
	const deviceA: UnifiDevice = { _id: 'a', name: 'AP A', type: 'uap', site: 'default' } as any
	const deviceB: UnifiDevice = { _id: 'b', name: 'AP B', type: 'udm', site: 'default' } as any

	describe('Basic Operations', () => {
		beforeEach(() => {
			cache = new DeviceCache()
		})

		it('should store and retrieve devices by ID', () => {
			cache.setDevices([deviceA, deviceB])
			expect(cache.getDeviceById('a')).toEqual(deviceA)
			expect(cache.getDeviceById('b')).toEqual(deviceB)
		})

		it('should return all devices', () => {
			cache.setDevices([deviceA, deviceB])
			expect(cache.getAllDevices()).toHaveLength(2)
		})

		it('should return undefined for missing device', () => {
			expect(cache.getDeviceById('missing')).toBeUndefined()
		})

		it('should update cache with new device list', () => {
			const deviceC: UnifiDevice = { _id: 'c', name: 'AP C', type: 'uap', site: 'default' } as any
			cache.setDevices([deviceA, deviceB])
			cache.setDevices([deviceA, deviceC])
			expect(cache.getDeviceById('b')).toBeUndefined()
			expect(cache.getDeviceById('c')).toEqual(deviceC)
		})

		it('should handle duplicate IDs by overwriting', () => {
			const dupA: UnifiDevice = { _id: 'a', name: 'AP A2', type: 'uap', site: 'default' } as any
			cache.setDevices([deviceA])
			cache.setDevices([dupA])
			expect(cache.getDeviceById('a')).toEqual(dupA)
		})
	})

	describe('Edge Cases', () => {
		beforeEach(() => {
			cache = new DeviceCache()
		})

		it('should handle empty device list', () => {
			cache.setDevices([])
			expect(cache.getAllDevices()).toHaveLength(0)
		})

		it('should clear the cache', () => {
			cache.setDevices([deviceA, deviceB])
			cache.clear()
			expect(cache.getAllDevices()).toHaveLength(0)
			expect(cache.getDeviceById('a')).toBeUndefined()
		})

		it('should not throw when clearing an already empty cache', () => {
			expect(() => cache.clear()).not.toThrow()
			expect(cache.getAllDevices()).toHaveLength(0)
		})
	})

	describe('Performance/Scalability', () => {
		it('cache handles large number of devices and clears all', async () => {
			const cache = new (await import('../../src/cache/deviceCache.js')).DeviceCache()
			const devices = Array.from({ length: 1000 }, (_, i) => ({
				_id: `id${i}`,
				mac: `00:11:22:33:44:${(i % 100).toString().padStart(2, '0')}`,
				site: 'default',
				type: 'uap',
				model: 'UAP',
				name: `AP${i}`,
				serial: `serial${i}`,
				version: 'v1',
			}))
			cache.setDevices(devices)
			expect(cache.getAllDevices().length).toBe(1000)
			cache.clear()
			expect(cache.getAllDevices().length).toBe(0)
		})
	})

	describe('DeviceCache.refreshDeviceCache', () => {
		let platform: any
		let log: any
		let sessionManager: any
		let accessories: any

		beforeEach(() => {
			log = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
			sessionManager = {
				authenticate: vi.fn().mockResolvedValue(undefined),
				getSiteName: vi.fn(site => site === 'valid' ? 'internal' : undefined),
				request: vi.fn(),
				getApiHelper: vi.fn(() => ({
					getDeviceListEndpoint: vi.fn(() => '/api/s/default/stat/device'),
				})),
			}
			accessories = [makeAccessory('A', 'a'), makeAccessory('B', 'b')]
			platform = {
				config: { sites: ['valid'] },
				log,
				Service: { Lightbulb: 'Lightbulb' },
				Characteristic: { On: 'On' },
				sessionManager,
				getDeviceCache: () => ({ setDevices, clear }),
				accessories,
			}
		})

		it('logs error and returns if no valid sites', async () => {
			platform.config.sites = ['invalid']
			await DeviceCache.refreshDeviceCache(platform)
			expect(log.error).toHaveBeenCalledWith('[API] Error [endpoint: refreshDeviceCache]: No valid sites resolved. Aborting device cache refresh.')
			expect(setDevices).not.toHaveBeenCalled()
		})

		it('sets devices and logs info on success', async () => {
			const { loadFixture } = await import('../fixtures/apiFixtures')
			const { data } = loadFixture('device-list-success.fixture.json')
			const getAccessPoints = vi.fn().mockResolvedValue(data)
			vi.doMock('../../src/unifi.js', () => ({ getAccessPoints }))
			const { DeviceCache } = await import('../../src/cache/deviceCache.js')
			await DeviceCache.refreshDeviceCache(platform)
			expect(getAccessPoints).toHaveBeenCalled()
			expect(setDevices).toHaveBeenCalledWith(data)
			expect(log.debug).toHaveBeenCalledWith(`[Cache Refresh] Device cache refreshed. ${data.length} devices currently available.`)
			vi.resetModules()
		})

		it('re-authenticates if getAccessPoints throws, then succeeds', async () => {
			const getAccessPoints = vi.fn()
			getAccessPoints
				.mockImplementationOnce(() => { throw new Error('fail') })
				.mockResolvedValueOnce([{ _id: 'b' }])
			vi.doMock('../../src/unifi.js', () => ({ getAccessPoints }))
			const { DeviceCache } = await import('../../src/cache/deviceCache.js')
			await DeviceCache.refreshDeviceCache(platform)
			expect(sessionManager.authenticate).toHaveBeenCalled()
			expect(setDevices).toHaveBeenCalledWith([{ _id: 'b' }])
			vi.resetModules()
		})

		it('handles UnifiAuthError in catch', async () => {
			const UnifiAuthError = class extends Error {}
			vi.doMock('../../src/models/unifiTypes.js', () => ({ UnifiAuthError, UnifiApiError: class {}, UnifiNetworkError: class {} }))
			vi.doMock('../../src/unifi.js', () => ({ getAccessPoints: vi.fn(() => { throw new UnifiAuthError('authfail') }) }))
			vi.doMock('../../src/utils/errorHandler.js', () => ({ markAccessoryNotResponding: vi.fn(), errorHandler: (log: any) => log.error('[API] Authentication error [endpoint: refreshDeviceCache]: authfail') }))
			const { DeviceCache } = await import('../../src/cache/deviceCache.js')
			await DeviceCache.refreshDeviceCache(platform)
			expect(log.error).toHaveBeenCalledWith('[API] Authentication error [endpoint: refreshDeviceCache]: authfail')
			vi.resetModules()
		})

		it('handles UnifiApiError in catch', async () => {
			const UnifiApiError = class extends Error {}
			vi.doMock('../../src/models/unifiTypes.js', () => ({ UnifiApiError, UnifiAuthError: class {}, UnifiNetworkError: class {} }))
			vi.doMock('../../src/unifi.js', () => ({ getAccessPoints: vi.fn(() => { throw new UnifiApiError('apifail') }) }))
			vi.doMock('../../src/utils/errorHandler.js', () => ({ markAccessoryNotResponding: vi.fn(), errorHandler: (log: any) => log.error('[API] API error [endpoint: refreshDeviceCache]: apifail') }))
			const { DeviceCache } = await import('../../src/cache/deviceCache.js')
			await DeviceCache.refreshDeviceCache(platform)
			expect(log.error).toHaveBeenCalledWith('[API] API error [endpoint: refreshDeviceCache]: apifail')
			vi.resetModules()
		})

		it('handles UnifiNetworkError in catch', async () => {
			const UnifiNetworkError = class extends Error {}
			vi.doMock('../../src/models/unifiTypes.js', () => ({ UnifiNetworkError, UnifiAuthError: class {}, UnifiApiError: class {} }))
			vi.doMock('../../src/unifi.js', () => ({ getAccessPoints: vi.fn(() => { throw new UnifiNetworkError('netfail') }) }))
			vi.doMock('../../src/utils/errorHandler.js', () => ({ markAccessoryNotResponding: vi.fn(), errorHandler: (log: any) => log.error('[API] Network error [endpoint: refreshDeviceCache]: netfail') }))
			const { DeviceCache } = await import('../../src/cache/deviceCache.js')
			await DeviceCache.refreshDeviceCache(platform)
			expect(log.error).toHaveBeenCalledWith('[API] Network error [endpoint: refreshDeviceCache]: netfail')
			vi.resetModules()
		})

		it('handles generic Error in catch', async () => {
			const Dummy = class extends Error {}
			vi.doMock('../../src/models/unifiTypes.js', () => ({ UnifiAuthError: Dummy, UnifiApiError: Dummy, UnifiNetworkError: Dummy }))
			vi.doMock('../../src/unifi.js', () => ({ getAccessPoints: vi.fn(() => { throw new Error('fail') }) }))
			vi.doMock('../../src/utils/errorHandler.js', () => ({ markAccessoryNotResponding: vi.fn(), errorHandler: (log: any) => log.error('[API] Error [endpoint: refreshDeviceCache]: fail') }))
			const { DeviceCache } = await import('../../src/cache/deviceCache.js')
			await DeviceCache.refreshDeviceCache(platform)
			expect(log.error).toHaveBeenCalledWith('[API] Error [endpoint: refreshDeviceCache]: fail')
			vi.resetModules()
		})

		it('handles string error in catch', async () => {
			const Dummy = class extends Error {}
			vi.doMock('../../src/models/unifiTypes.js', () => ({ UnifiAuthError: Dummy, UnifiApiError: Dummy, UnifiNetworkError: Dummy }))
			vi.doMock('../../src/unifi.js', () => ({ getAccessPoints: vi.fn(() => { throw 'failstr' }) }))
			vi.doMock('../../src/utils/errorHandler.js', () => ({ markAccessoryNotResponding: vi.fn(), errorHandler: (log: any) => log.error('[API] Error [endpoint: refreshDeviceCache]: failstr') }))
			const { DeviceCache } = await import('../../src/cache/deviceCache.js')
			await DeviceCache.refreshDeviceCache(platform)
			expect(log.error).toHaveBeenCalledWith('[API] Error [endpoint: refreshDeviceCache]: failstr')
			vi.resetModules()
		})

		it('handles unknown error in catch', async () => {
			const unknownErr = { foo: 1 }
			const Dummy = class extends Error {}
			vi.doMock('../../src/models/unifiTypes.js', () => ({ UnifiAuthError: Dummy, UnifiApiError: Dummy, UnifiNetworkError: Dummy }))
			vi.doMock('../../src/unifi.js', () => ({ getAccessPoints: vi.fn(() => { throw unknownErr }) }))
			vi.doMock('../../src/utils/errorHandler.js', () => ({ markAccessoryNotResponding: vi.fn(), errorHandler: (log: any) => log.error('[API] Error [endpoint: refreshDeviceCache]: [object Object]') }))
			const { DeviceCache } = await import('../../src/cache/deviceCache.js')
			await DeviceCache.refreshDeviceCache(platform)
			expect(log.error).toHaveBeenCalledWith('[API] Error [endpoint: refreshDeviceCache]: [object Object]')
			vi.resetModules()
		})

		it('marks all accessories as Not Responding and clears cache on error', async () => {
			const markAccessoryNotResponding = vi.fn()
			platform.getDeviceCache = () => ({ setDevices, clear })
			const Dummy = class extends Error {}
			const getAccessPoints = vi.fn(() => { throw new Error('fail') })
			vi.doMock('../../src/unifi.js', () => ({ getAccessPoints }))
			vi.doMock('../../src/utils/errorHandler.js', () => ({ markAccessoryNotResponding, errorHandler: vi.fn() }))
			vi.doMock('../../src/models/unifiTypes.js', () => ({ UnifiAuthError: Dummy, UnifiApiError: Dummy, UnifiNetworkError: Dummy }))
			const { DeviceCache } = await import('../../src/cache/deviceCache.js')
			await DeviceCache.refreshDeviceCache(platform)
			for (const accessory of accessories) {
				expect(markAccessoryNotResponding).toHaveBeenCalledWith(platform, accessory)
			}
			expect(log.error).toHaveBeenCalledTimes(0)
			vi.resetModules()
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})
})
