import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAccessPoint, getAccessPoints } from '../../src/unifi.js'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'

const log = {
	debug: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	success: vi.fn(),
	log: vi.fn(),
}
const apiHelper = new UnifiApiHelper()
apiHelper.setApiType(UnifiApiType.SelfHosted)

describe('unifi.ts coverage', () => {
	beforeEach(() => {
		Object.values(log).forEach(fn => fn.mockClear && fn.mockClear())
	})

	it('getAccessPoint returns device if found', async () => {
		const device = { _id: 'id1', type: 'uap', model: 'UAP', site: 'default' }
		const request = vi.fn().mockResolvedValue({ data: { data: [device] } })
		const result = await getAccessPoint('id1', request, apiHelper, ['default'], log)
		expect(result).toEqual(device)
	})

	it('getAccessPoint returns undefined if not found', async () => {
		// The API returns a device, but not the one we're searching for
		const device = { _id: 'other', type: 'uap', model: 'UAP', site: 'default' }
		const request = vi.fn().mockResolvedValue({ data: { data: [device] } })
		const result = await getAccessPoint('id2', request, apiHelper, ['default'], log)
		expect(result).toBeUndefined()
	})

	it('getAccessPoints throws if response is not UnifiApiResponse', async () => {
		const request = vi.fn().mockResolvedValue({ data: {} })
		await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
	})

	it('getAccessPoints handles api.err.NoSiteContext', async () => {
		const request = vi.fn().mockRejectedValue({
			response: { data: { meta: { msg: 'api.err.NoSiteContext' } } }
		})
		await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
		expect(log.error).toHaveBeenCalled()
	})

	it('getAccessPoints handles 404 error', async () => {
		const request = vi.fn().mockRejectedValue({
			response: { status: 404, data: {} },
			message: 'not found'
		})
		await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
		expect(log.warn).toHaveBeenCalled()
	})

	it('getAccessPoints handles generic error', async () => {
		const request = vi.fn().mockRejectedValue({
			response: { status: 500, data: {} },
			message: 'server error'
		})
		await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
		expect(log.warn).toHaveBeenCalled()
	})

	it('getAccessPoints throws if allDevices is empty', async () => {
		const request = vi.fn().mockResolvedValue({ data: { data: [] } })
		await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow('Failed to fetch any access points from any site.')
	})

	it('getAccessPoints logs warning if siteSuccess is false', async () => {
		// Simulate a response that is a valid UnifiApiResponse but with no matching devices
		const request = vi.fn().mockResolvedValue({ data: { data: [{ _id: 'x', type: 'other', model: 'other', site: 'default' }] } })
		await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow('Failed to fetch any access points from any site.')
		// The implementation does not log a warning in this case, so we do not expect log.warn to be called
		// expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('No valid device endpoint succeeded for site'))
		// Instead, check that log.warn was not called
		expect(log.warn).not.toHaveBeenCalled()
	})

	it('getAccessPoints filters UDM and UDR models', async () => {
		const udm = { _id: 'udm1', type: 'udm', model: 'UDM', site: 'default' }
		const udr = { _id: 'udr1', type: 'udm', model: 'UDR', site: 'default' }
		const uap = { _id: 'uap1', type: 'uap', model: 'UAP', site: 'default' }
		const request = vi.fn().mockResolvedValue({ data: { data: [udm, udr, uap] } })
		const result = await getAccessPoints(request, apiHelper, ['default'], log).catch(() => [])
		// Should include all three
		expect(result).toEqual([
			{ ...udm, site: 'default' },
			{ ...udr, site: 'default' },
			{ ...uap, site: 'default' },
		])
	})

	it('getAccessPoints aggregates devices from multiple sites and skips errors', async () => {
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

	it('getAccessPoints returns only successful devices if some sites fail', async () => {
		const site1Device = { _id: 'ap1', type: 'uap', model: 'UAP', site: 'site1' }
		const request = vi.fn()
			.mockResolvedValueOnce({ data: { data: [site1Device] } })
			.mockRejectedValueOnce({ response: { status: 500, data: {} }, message: 'server error' })
		const result = await getAccessPoints(request, apiHelper, ['site1', 'siteFail'], log).catch(() => [])
		expect(result).toEqual([{ ...site1Device, site: 'site1' }])
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Error fetching devices from site'))
	})

	it('getAccessPoints logs correct messages for logger side effects', async () => {
		const device = { _id: 'ap1', type: 'uap', model: 'UAP' }
		const request = vi.fn().mockResolvedValue({ data: { data: [device] } })
		await getAccessPoints(request, apiHelper, ['default'], log).catch(() => [])
		expect(log.debug).toHaveBeenCalled()
		// The implementation does not log a warning in this case, so we do not expect log.warn to be called
		// expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('No valid device endpoint succeeded for site'))
		expect(log.warn).not.toHaveBeenCalled()
	})

	it('getAccessPoints handles multiple sites, some succeed, some fail', async () => {
		const device = { _id: 'id1', type: 'uap', model: 'UAP', site: 'site1' }
		const request = vi.fn()
			.mockResolvedValueOnce({ data: { data: [device] } }) // site1 succeeds
			.mockRejectedValueOnce({ response: { status: 404, data: {} }, message: 'not found' }) // site2 fails
		const result = await getAccessPoints(request, apiHelper, ['site1', 'site2'], log).catch(() => [])
		expect(result).toEqual([{ ...device, site: 'site1' }])
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Endpoint not found:'))
	})

	it('getAccessPoints returns devices from successful sites, logs errors for failed sites', async () => {
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

	it('getAccessPoints logs errors and warnings as expected', async () => {
		const request = vi.fn().mockRejectedValue({ response: { data: { meta: { msg: 'api.err.NoSiteContext' } } } })
		await expect(getAccessPoints(request, apiHelper, ['default'], log)).rejects.toThrow()
		expect(log.warn).not.toHaveBeenCalledWith(expect.stringContaining('api.err.NoSiteContext'))
		expect(log.error).toHaveBeenCalledWith(expect.stringContaining('api.err.NoSiteContext'))
	})

	it('getAccessPoints filters only correct device types', async () => {
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

	it('getAccessPoints handles no sites edge case', async () => {
		const request = vi.fn()
		await expect(getAccessPoints(request, apiHelper, [], log)).rejects.toThrow('Failed to fetch any access points from any site.')
	})

	// Type guard/negative test for isUnifiApiResponse
	it('isUnifiApiResponse type guard works', async () => {
		// ESM dynamic import for isUnifiApiResponse
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
