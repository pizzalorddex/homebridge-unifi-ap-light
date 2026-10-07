import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { mockLoggerFull } from '../fixtures/homebridgeMocks.js'

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
			const log = mockLoggerFull
			const helper = new UnifiApiHelper()
			await expect(helper.detectApiType(instance as any, 'u', 'p', log)).rejects.toThrow('Unable to detect UniFi API structure.')
		})

		it('should detect UnifiOS API type', async () => {
			const response = { headers: { 'set-cookie': ['TOKEN=test'] } }
			const instance = { post: vi.fn().mockResolvedValueOnce(response) }
			const log = mockLoggerFull
			const type = await apiHelper.detectApiType(instance as any, 'u', 'p', log)
			expect(type).toBe(UnifiApiType.UnifiOS)
			expect(apiHelper.getApiType()).toBe(UnifiApiType.UnifiOS)
			expect(apiHelper.takeAuthenticationResponse()).toBe(response)
			expect(apiHelper.takeAuthenticationResponse()).toBeNull()
		})

		it('should detect SelfHosted API type if UnifiOS fails', async () => {
			const instance = {
				post: vi.fn()
					.mockRejectedValueOnce(new Error('fail'))
					.mockResolvedValueOnce({}),
			}
			const log = mockLoggerFull
			const type = await apiHelper.detectApiType(instance as any, 'u', 'p', log)
			expect(type).toBe(UnifiApiType.SelfHosted)
			expect(apiHelper.getApiType()).toBe(UnifiApiType.SelfHosted)
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
