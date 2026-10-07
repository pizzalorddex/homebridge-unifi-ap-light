import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Service, Characteristic, uuid } from 'hap-nodejs'
import { UniFiAP } from '../../src/accessory/platformAccessory.js'
import { DeviceCache } from '../../src/cache/deviceCache.js'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { resetErrorState } from '../../src/utils/errorLogManager.js'
import { mockLogger } from '../fixtures/homebridgeMocks.js'

const device = { _id: 'test-ap', mac: '00:00:00:00:00:00', site: 'default', type: 'uap',
	model: 'Test', name: 'Test AP', serial: 'synthetic', version: '1', led_override: 'off' }

function fixture(initial = { ...device }) {
	const cache = new DeviceCache()
	cache.setDevices([initial, { ...device, _id: 'other-ap' }])
	const light = new Service.Lightbulb('Test AP')
	const info = new Service.AccessoryInformation()
	const accessory = { UUID: uuid.generate(initial._id), context: { accessPoint: initial },
		getService: (type: unknown) => type === Service.Lightbulb ? light : info }
	const helper = new UnifiApiHelper()
	helper.setApiType(UnifiApiType.UnifiOS)
	const platform = { config: {}, log: mockLogger, Service, Characteristic,
		getDeviceCache: () => cache,
		forceImmediateCacheRefresh: vi.fn().mockResolvedValue(undefined),
		sessionManager: { getApiHelper: () => helper,
			getSiteLedEnabled: vi.fn().mockResolvedValue(true),
			request: vi.fn().mockResolvedValue({ status: 200, data: { meta: { rc: 'ok' }, data: [] } }) } }
	return { cache, light, info, accessory, platform, control: new UniFiAP(platform as any, accessory as any) }
}

beforeEach(() => { vi.clearAllMocks(); resetErrorState() })

describe('UniFiAP HomeKit behavior', () => {
	it('binds real On handlers and accessory information', () => {
		const f = fixture()
		expect(f.light.getCharacteristic(Characteristic.On).setHandler).toBeDefined()
		expect(f.light.getCharacteristic(Characteristic.On).getHandler).toBeDefined()
		expect(f.info.getCharacteristic(Characteristic.Manufacturer).value).toBe('Ubiquiti')
	})

	it('writes only LED fields and keeps other devices', async () => {
		const f = fixture()
		await f.control.setOn(true)
		expect(f.platform.sessionManager.request).toHaveBeenCalledWith({ method: 'put',
			url: '/proxy/network/api/s/default/rest/device/test-ap', data: { led_override: 'on' } })
		expect(f.cache.getDeviceById('test-ap')?.led_override).toBe('on')
		expect(f.cache.getDeviceById('other-ap')).toBeDefined()
	})

	it.each([
		{ status: 500, data: {} },
		{ status: 200, data: { meta: { rc: 'error' } } },
		{ status: 200, data: {} },
	])('rejects an unaccepted controller response: %j', async response => {
		const f = fixture()
		f.platform.sessionManager.request.mockResolvedValue(response)
		await expect(f.light.getCharacteristic(Characteristic.On).handleSetRequest(true, undefined)).rejects.toBe(-70402)
		expect(f.light.getCharacteristic(Characteristic.On).value).not.toBe(true)
		expect(f.cache.getDeviceById('test-ap')).toBeUndefined()
		expect(f.cache.getDeviceById('other-ap')).toBeDefined()
	})

	it('reports a failed network write to HomeKit instead of acknowledging it', async () => {
		const f = fixture()
		f.platform.sessionManager.request.mockRejectedValue(new Error('Synthetic network failure'))
		const on = f.light.getCharacteristic(Characteristic.On)
		await expect(on.handleSetRequest(true, undefined)).rejects.toBe(-70402)
		expect(on.statusCode).toBe(-70402)
	})

	it('uses current site and preserves a refresh that finishes during the write', async () => {
		const f = fixture()
		f.cache.setDevice({ ...device, site: 'new-site', version: '2' })
		f.platform.sessionManager.request.mockImplementation(async () => {
			f.cache.setDevice({ ...device, site: 'new-site', version: '3' })
			return { status: 200, data: { meta: { rc: 'ok' } } }
		})
		await f.control.setOn(true)
		expect(f.platform.sessionManager.request.mock.calls[0][0].url).toContain('/s/new-site/')
		expect(f.cache.getDeviceById('test-ap')).toMatchObject({ site: 'new-site', version: '3', led_override: 'on' })
	})

	it('does not let a delayed inherited-state read overwrite a newer HomeKit write', async () => {
		const f = fixture({ ...device, led_override: 'default' })
		let finish!: (value: boolean) => void
		const pending = new Promise<boolean>(resolve => { finish = resolve })
		f.platform.sessionManager.getSiteLedEnabled.mockReturnValue(pending as any)
		new UniFiAP(f.platform as any, f.accessory as any)
		const on = f.light.getCharacteristic(Characteristic.On)
		await on.handleSetRequest(true, undefined)
		finish(false)
		await Promise.resolve()
		await Promise.resolve()
		expect(on.value).toBe(true)
	})

	it('does not overwrite a device moved to another site during a write', async () => {
		const f = fixture()
		f.platform.sessionManager.request.mockImplementation(async () => {
			f.cache.setDevice({ ...device, site: 'new-site', led_override: 'off' })
			return { status: 200, data: { meta: { rc: 'ok' } } }
		})
		await f.control.setOn(true)
		expect(f.cache.getDeviceById('test-ap')).toMatchObject({ site: 'new-site', led_override: 'off' })
	})

	it.each(['default', undefined])('resolves inherited LED state: %s', async led_override => {
		const f = fixture({ ...device, led_override } as any)
		expect(await f.control.getOn()).toBe(true)
		f.platform.sessionManager.getSiteLedEnabled.mockResolvedValue(false)
		expect(await f.control.getOn()).toBe(false)
		expect(f.platform.sessionManager.getSiteLedEnabled).toHaveBeenCalledWith('default')
	})

	it.each(['on', 'off'])('reads explicit state without a site-settings request: %s', async led_override => {
		const f = fixture({ ...device, led_override })
		expect(await f.control.getOn()).toBe(led_override === 'on')
		expect(f.platform.sessionManager.getSiteLedEnabled).not.toHaveBeenCalled()
	})

	it('reports unknown inherited state as unavailable', async () => {
		const f = fixture({ ...device, led_override: 'default' })
		f.platform.sessionManager.getSiteLedEnabled.mockRejectedValue(new Error('Setting unavailable'))
		await expect(f.control.getOn()).rejects.toThrow('Not Responding')
	})

	it('recovers a cache miss once, then returns the recovered state', async () => {
		const f = fixture()
		f.cache.removeDevice('test-ap')
		f.platform.forceImmediateCacheRefresh.mockImplementation(async () => { f.cache.setDevice({ ...device, led_override: 'on' }) })
		expect(await f.control.getOn()).toBe(true)
		expect(f.platform.forceImmediateCacheRefresh).toHaveBeenCalledOnce()
	})

	it('rejects a missing device after one unsuccessful recovery', async () => {
		const f = fixture()
		f.cache.removeDevice('test-ap')
		await expect(f.control.getOn()).rejects.toThrow('Not Responding')
		expect(f.platform.forceImmediateCacheRefresh).toHaveBeenCalledOnce()
	})

	it('keeps the existing UDM payload and reads its boolean state', async () => {
		const f = fixture({ ...device, type: 'udm', ledSettings: { enabled: false } } as any)
		await f.control.setOn(true)
		expect(f.platform.sessionManager.request.mock.calls[0][0].data).toEqual({ ledSettings: { enabled: true } })
		expect(await f.control.getOn()).toBe(true)
	})
})
