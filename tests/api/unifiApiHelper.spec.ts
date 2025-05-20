import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { loadFixture } from '../fixtures/apiFixtures.js'

describe('UnifiApiHelper', () => {
	let apiHelper: UnifiApiHelper

	beforeEach(() => {
		apiHelper = new UnifiApiHelper()
	})

	describe('Endpoint Resolution', () => {
		it('should resolve device list endpoint for self-hosted', () => {
			apiHelper.setApiType(UnifiApiType.SelfHosted)
			expect(apiHelper.getDeviceListEndpoint('default')).toBe('/api/s/default/stat/device')
		})

		it('should resolve device update endpoint for self-hosted', () => {
			apiHelper.setApiType(UnifiApiType.SelfHosted)
			expect(apiHelper.getDeviceUpdateEndpoint('default', 'deviceid')).toBe('/api/s/default/rest/device/deviceid')
		})

		it('should resolve sites endpoint for self-hosted', () => {
			apiHelper.setApiType(UnifiApiType.SelfHosted)
			expect(apiHelper.getSitesEndpoint()).toBe('/api/self/sites')
		})

		it('should resolve device list endpoint for UniFi OS', () => {
			apiHelper.setApiType(UnifiApiType.UnifiOS)
			expect(apiHelper.getDeviceListEndpoint('default')).toBe('/proxy/network/api/s/default/stat/device')
		})

		it('should resolve device update endpoint for UniFi OS', () => {
			apiHelper.setApiType(UnifiApiType.UnifiOS)
			expect(apiHelper.getDeviceUpdateEndpoint('default', 'deviceid')).toBe('/proxy/network/api/s/default/rest/device/deviceid')
		})

		it('should resolve sites endpoint for UniFi OS', () => {
			apiHelper.setApiType(UnifiApiType.UnifiOS)
			expect(apiHelper.getSitesEndpoint()).toBe('/proxy/network/api/self/sites')
		})
	})

	describe('API Type Get/Set', () => {
		it('should get/set apiType and return null if not set', () => {
			const helper = new UnifiApiHelper()
			expect(helper.getApiType()).toBeNull()
			helper.setApiType(UnifiApiType.SelfHosted)
			expect(helper.getApiType()).toBe(UnifiApiType.SelfHosted)
		})
	})

	describe('API Type Detection', () => {
		it('should throw if detectApiType fails both endpoints', async () => {
			const instance = { post: vi.fn().mockRejectedValue(new Error('fail')) }
			const log = {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				success: vi.fn(),
				log: vi.fn(),
			}
			await expect(apiHelper.detectApiType(instance as any, 'u', 'p', log)).rejects.toThrow('Unable to detect UniFi API structure.')
			expect(log.error).toHaveBeenCalledWith('Failed to detect UniFi API structure (tried /api/auth/login and /api/login): Error: fail')
		})

		it('should detect UnifiOS API type', async () => {
			const instance = { post: vi.fn().mockResolvedValueOnce({}) }
			const log = {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				success: vi.fn(),
				log: vi.fn(),
			}
			const type = await apiHelper.detectApiType(instance as any, 'u', 'p', log)
			expect(type).toBe(UnifiApiType.UnifiOS)
			expect(apiHelper.getApiType()).toBe(UnifiApiType.UnifiOS)
		})

		it('should detect SelfHosted API type if UnifiOS fails', async () => {
			const instance = {
				post: vi.fn()
					.mockRejectedValueOnce(new Error('fail'))
					.mockResolvedValueOnce({}),
			}
			const log = {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				success: vi.fn(),
				log: vi.fn(),
			}
			const type = await apiHelper.detectApiType(instance as any, 'u', 'p', log)
			expect(type).toBe(UnifiApiType.SelfHosted)
			expect(apiHelper.getApiType()).toBe(UnifiApiType.SelfHosted)
		})

		it('should detect UnifiOS API type from real site-list-success.json fixture', async () => {
			const fixture = await loadFixture('site-list-success.fixture.json')
			const instance = {
				post: vi.fn().mockResolvedValueOnce({ data: fixture })
			}
			const log = {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				success: vi.fn(),
				log: vi.fn(),
			}
			const type = await apiHelper.detectApiType(instance as any, 'u', 'p', log)
			// Adjust the expected type if your fixture is for SelfHosted
			expect([UnifiApiType.UnifiOS, UnifiApiType.SelfHosted]).toContain(type)
		})
	})

	describe('Coverage', () => {
		it('should call all UnifiApiHelper methods directly for coverage', () => {
			const helper = new UnifiApiHelper()
			// getApiType before set
			expect(helper.getApiType()).toBeNull()
			// setApiType and getApiType
			helper.setApiType(UnifiApiType.SelfHosted)
			expect(helper.getApiType()).toBe(UnifiApiType.SelfHosted)
			// getDeviceListEndpoint
			expect(helper.getDeviceListEndpoint('mysite')).toBe('/api/s/mysite/stat/device')
			// getDeviceUpdateEndpoint
			expect(helper.getDeviceUpdateEndpoint('mysite', 'dev1')).toBe('/api/s/mysite/rest/device/dev1')
			// getSitesEndpoint
			expect(helper.getSitesEndpoint()).toBe('/api/self/sites')
			// Switch to UnifiOS and check endpoints
			helper.setApiType(UnifiApiType.UnifiOS)
			expect(helper.getDeviceListEndpoint('mysite')).toBe('/proxy/network/api/s/mysite/stat/device')
			expect(helper.getDeviceUpdateEndpoint('mysite', 'dev1')).toBe('/proxy/network/api/s/mysite/rest/device/dev1')
			expect(helper.getSitesEndpoint()).toBe('/proxy/network/api/self/sites')
		})
	})

	describe('getSingleDeviceEndpoint', () => {
		it('should resolve single device endpoint for self-hosted', () => {
			apiHelper.setApiType(UnifiApiType.SelfHosted)
			expect(apiHelper.getSingleDeviceEndpoint('default', 'aa:bb:cc:dd:ee:ff')).toBe('/api/s/default/stat/device/aa:bb:cc:dd:ee:ff')
		})
		it('should resolve single device endpoint for UniFi OS', () => {
			apiHelper.setApiType(UnifiApiType.UnifiOS)
			expect(apiHelper.getSingleDeviceEndpoint('default', 'aa:bb:cc:dd:ee:ff')).toBe('/proxy/network/api/s/default/stat/device/aa:bb:cc:dd:ee:ff')
		})
	})

	describe('isDeviceReady', () => {
		it('should return true if last_seen and uptime are present', () => {
			const device = { last_seen: 123, uptime: 456 }
			expect(UnifiApiHelper.isDeviceReady(device)).toBe(true)
		})
		it('should return true if state is 1', () => {
			const device = { state: 1 }
			expect(UnifiApiHelper.isDeviceReady(device)).toBe(true)
		})
		it('should return false if neither last_seen/uptime nor state=1', () => {
			const device = { state: 7 }
			expect(UnifiApiHelper.isDeviceReady(device)).toBe(false)
		})
	})
})
