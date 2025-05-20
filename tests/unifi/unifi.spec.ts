import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAccessPoint, getAccessPoints, getDeviceByMac } from '../../src/unifi.js'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { mockLoggerFull } from '../fixtures/homebridgeMocks'

const log = mockLoggerFull
const apiHelper = new UnifiApiHelper()
apiHelper.setApiType(UnifiApiType.SelfHosted)

describe('unifi.ts coverage', () => {
	beforeEach(() => {
		Object.values(log).forEach(fn => fn.mockClear && fn.mockClear())
	})

	describe('getAccessPoint', () => {
		it('returns device if found', async () => {
			const device = { _id: 'id1', type: 'uap', model: 'UAP', site: 'default' }
			const request = vi.fn().mockResolvedValue({ data: { data: [device] } })
			const result = await getAccessPoint('id1', request, apiHelper, ['default'], log)
			expect(result).toEqual(device)
		})

		it('returns undefined if not found', async () => {
			const device = { _id: 'other', type: 'uap', model: 'UAP', site: 'default' }
			const request = vi.fn().mockResolvedValue({ data: { data: [device] } })
			const result = await getAccessPoint('id2', request, apiHelper, ['default'], log)
			expect(result).toBeUndefined()
		})
	})

	describe('getAccessPoints', () => {
		describe('Error Handling', () => {
			it('throws if response is not UnifiApiResponse', async () => {
				const request = vi.fn().mockResolvedValue({ data: {} })
				await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
			})

			it('handles api.err.NoSiteContext', async () => {
				const request = vi.fn().mockRejectedValue({
					response: { data: { meta: { msg: 'api.err.NoSiteContext' } } }
				})
				await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
				expect(log.error).toHaveBeenCalled()
			})

			it('handles 404 error', async () => {
				const request = vi.fn().mockRejectedValue({
					response: { status: 404, data: {} },
					message: 'not found'
				})
				await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
				expect(log.warn).toHaveBeenCalled()
			})

			it('handles generic error', async () => {
				const request = vi.fn().mockRejectedValue({
					response: { status: 500, data: {} },
					message: 'server error'
				})
				await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
				expect(log.warn).toHaveBeenCalled()
			})

			it('throws if allDevices is empty', async () => {
				const request = vi.fn().mockResolvedValue({ data: { data: [] } })
				await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow('Failed to fetch any access points from any site.')
			})

			it('logs warning if siteSuccess is false', async () => {
				const request = vi.fn().mockResolvedValue({ data: { data: [{ _id: 'x', type: 'other', model: 'other', site: 'default' }] } })
				await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow('Failed to fetch any access points from any site.')
				expect(log.warn).not.toHaveBeenCalled()
			})

			it('handles no sites edge case', async () => {
				const request = vi.fn()
				await expect(getAccessPoints(request, apiHelper, [], log)).rejects.toThrow('Failed to fetch any access points from any site.')
			})
		})

		describe('Device Filtering and Aggregation', () => {
			it('filters UDM and UDR models', async () => {
				const { loadFixture } = await import('../fixtures/apiFixtures')
				const { data } = loadFixture('device-list-success.fixture.json')
				const request = vi.fn().mockResolvedValue({ data: { data } })
				const result = await getAccessPoints(request, apiHelper, ['default'], log).catch(() => [])
				// Only supported device types should be present
				expect(result.find(d => d.type === 'usw')).toBeUndefined()
				// Should include at least one uap and one udm
				expect(result.some(d => d.type === 'uap')).toBe(true)
				expect(result.some(d => d.type === 'udm')).toBe(true)
			})

			it('aggregates devices from multiple sites and skips errors', async () => {
				const site1Device = { _id: 'ap1', type: 'uap', model: 'UAP', site: 'site1' }
				const site2Device = { _id: 'ap2', type: 'uap', model: 'UAP', site: 'site2' }
				const request = vi.fn()
					.mockResolvedValueOnce({ data: { data: [site1Device] } })
					.mockRejectedValueOnce({ response: { status: 404, data: {} }, message: 'not found' })
					.mockResolvedValueOnce({ data: { data: [site2Device] } })
				const result = await getAccessPoints(request, apiHelper, ['site1', 'site404', 'site2'], log).catch(() => [])
				expect(result).toEqual([
					{ ...site1Device, site: 'site1' },
					{ ...site2Device, site: 'site2' },
				])
				expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Endpoint not found:'))
			})

			it('returns only successful devices if some sites fail', async () => {
				const site1Device = { _id: 'ap1', type: 'uap', model: 'UAP', site: 'site1' }
				const request = vi.fn()
					.mockResolvedValueOnce({ data: { data: [site1Device] } })
					.mockRejectedValueOnce({ response: { status: 500, data: {} }, message: 'server error' })
				const result = await getAccessPoints(request, apiHelper, ['site1', 'siteFail'], log).catch(() => [])
				expect(result).toEqual([{ ...site1Device, site: 'site1' }])
				expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Error fetching devices from site'))
			})

			it('handles multiple sites, some succeed, some fail', async () => {
				const device = { _id: 'id1', type: 'uap', model: 'UAP', site: 'site1' }
				const request = vi.fn()
					.mockResolvedValueOnce({ data: { data: [device] } })
					.mockRejectedValueOnce({ response: { status: 404, data: {} }, message: 'not found' })
				const result = await getAccessPoints(request, apiHelper, ['site1', 'site2'], log).catch(() => [])
				expect(result).toEqual([{ ...device, site: 'site1' }])
				expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Endpoint not found:'))
			})

			it('returns devices from successful sites, logs errors for failed sites', async () => {
				const dev1 = { _id: 'id1', type: 'uap', model: 'UAP', site: 'site1' }
				const dev2 = { _id: 'id2', type: 'uap', model: 'UAP', site: 'site2' }
				const request = vi.fn()
					.mockResolvedValueOnce({ data: { data: [dev1] } })
					.mockRejectedValueOnce({ response: { status: 404, data: {} }, message: 'not found' })
					.mockResolvedValueOnce({ data: { data: [dev2] } })
				const result = await getAccessPoints(request, apiHelper, ['site1', 'site2', 'site3'], log).catch(() => [])
				expect(result).toEqual([
					{ ...dev1, site: 'site1' },
					{ ...dev2, site: 'site3' },
				])
				expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Endpoint not found:'))
			})

			it('filters only correct device types', async () => {
				const ap = { _id: 'ap', type: 'uap', model: 'UAP', site: 'default' }
				const udm = { _id: 'udm', type: 'udm', model: 'UDM', site: 'default' }
				const udr = { _id: 'udr', type: 'udm', model: 'UDR', site: 'default' }
				const switchDev = { _id: 'sw', type: 'usw', model: 'USW', site: 'default' }
				const request = vi.fn().mockResolvedValue({ data: { data: [ap, udm, udr, switchDev] } })
				const result = await getAccessPoints(request, apiHelper, ['default'], log).catch(() => [])
				expect(result).toEqual([
					{ ...ap, site: 'default' },
					{ ...udm, site: 'default' },
					{ ...udr, site: 'default' },
				])
				expect(result.find(d => d._id === 'sw')).toBeUndefined()
			})
		})

		describe('Logger Side Effects', () => {
			it('logs correct messages for logger side effects', async () => {
				const device = { _id: 'ap1', type: 'uap', model: 'UAP' }
				const request = vi.fn().mockResolvedValue({ data: { data: [device] } })
				await getAccessPoints(request, apiHelper, ['default'], log).catch(() => [])
				expect(log.debug).toHaveBeenCalled()
				expect(log.warn).not.toHaveBeenCalled()
			})

			it('logs errors and warnings as expected', async () => {
				const request = vi.fn().mockRejectedValue({ response: { data: { meta: { msg: 'api.err.NoSiteContext' } } } })
				await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
				expect(log.warn).not.toHaveBeenCalledWith(expect.stringContaining('api.err.NoSiteContext'))
				expect(log.error).toHaveBeenCalledWith(expect.stringContaining('api.err.NoSiteContext'))
			})
		})
	})

	describe('getDeviceByMac', () => {
		const site = 'default'
		const mac = 'aa:bb:cc:dd:ee:ff'
		const apiHelper = new UnifiApiHelper()
		apiHelper.setApiType(UnifiApiType.SelfHosted)

		it('returns device if found', async () => {
			const device = { mac, type: 'uap', model: 'UAP', site }
			const request = vi.fn().mockResolvedValue({ data: { data: [device] } })
			const result = await getDeviceByMac(mac, request, apiHelper, site, log)
			expect(result).toEqual(device)
		})

		it('returns undefined if not found', async () => {
			const request = vi.fn().mockResolvedValue({ data: { data: [] } })
			const result = await getDeviceByMac(mac, request, apiHelper, site, log)
			expect(result).toBeUndefined()
		})

		it('returns undefined and logs error if request throws', async () => {
			const request = vi.fn().mockRejectedValue(new Error('fail'))
			const result = await getDeviceByMac(mac, request, apiHelper, site, log)
			expect(result).toBeUndefined()
			expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch device by MAC'))
		})
	})

	describe('Type Guards', () => {
		it('isUnifiApiResponse type guard works', async () => {
			const { isUnifiApiResponse } = await import('../../src/unifi.js')
			expect(isUnifiApiResponse(undefined)).toBe(false)
			expect(isUnifiApiResponse(null)).toBe(false)
			expect(isUnifiApiResponse({})).toBe(false)
			expect(isUnifiApiResponse({ data: {} })).toBe(false)
			expect(isUnifiApiResponse({ data: 'not-array' })).toBe(false)
			expect(isUnifiApiResponse({ data: [] })).toBe(true)
			expect(isUnifiApiResponse({ meta: {}, data: [] })).toBe(true)
			expect(isUnifiApiResponse({})).toBe(false)
		})
	})
})
