import { afterEach, describe, expect, it, vi } from 'vitest'
import * as hap from 'hap-nodejs'
import { UniFiAP } from '../../src/accessory/platformAccessory.js'
import { DeviceCache } from '../../src/cache/deviceCache.js'
import * as capabilities from '../../src/accessory/ledCapabilities.js'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { createAndRegisterAccessory, restoreAccessory, removeAccessory } from '../../src/accessory/accessoryFactory.js'

const device = { _id: 'synthetic-ap', mac: '00:00:00:00:00:00', site: 'default', type: 'uap',
	model: 'Test RGB AP', name: 'Test AP', serial: 'synthetic', version: '1', hw_caps: 2562,
	led_override: 'on', led_override_color: '#0000ff', led_override_color_brightness: '75' }
class TestAccessory extends hap.Accessory { context: any = {} }
function fixture(overrides = {}, enabled = true, apiType = UnifiApiType.UnifiOS) {
	const ap = { ...device, ...overrides }
	const cache = new DeviceCache()
	cache.setDevices([ap])
	const helper = new UnifiApiHelper()
	helper.setApiType(apiType)
	const platform = { config: { enableRgb: enabled }, Service: hap.Service, Characteristic: hap.Characteristic,
		accessories: [], getDeviceCache: () => cache, isShuttingDown: false,
		log: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(k => [k, vi.fn()])),
		forceImmediateCacheRefresh: vi.fn(),
		api: { platformAccessory: TestAccessory, registerPlatformAccessories: vi.fn(), unregisterPlatformAccessories: vi.fn(), updatePlatformAccessories: vi.fn() },
		sessionManager: { getApiHelper: () => helper, getSiteLedEnabled: vi.fn().mockResolvedValue(true),
			request: vi.fn().mockResolvedValue({ status: 200, data: { meta: { rc: 'ok' } } }) },
	}
	const refresh = vi.spyOn(UniFiAP.prototype, 'refresh')
	const accessory = createAndRegisterAccessory(platform as any, ap, hap.uuid.generate(ap._id))
	const control = refresh.mock.contexts.at(-1) as UniFiAP
	const light = accessory.getService(hap.Service.Lightbulb)!
	return { cache, helper, platform, accessory, control, light }
}
async function flush(promise: Promise<unknown>) {
	await vi.advanceTimersByTimeAsync(50)
	return promise
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('RGB accessory controls', () => {
	it('uses native lightbulb characteristics only for opted-in capable APs', async () => {
		const f = fixture()
		for (const c of [hap.Characteristic.Hue, hap.Characteristic.Saturation, hap.Characteristic.Brightness]) {
			expect(f.light.testCharacteristic(c)).toBe(true)
		}
		expect(await f.control.getHue()).toBe(240)
		expect(await f.control.getSaturation()).toBe(100)
		expect(await f.control.getBrightness()).toBe(75)
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it.each([{}, { hw_caps: 20480, model: 'U7PRO' }, { hw_caps: undefined }, { hw_caps: -1 }, { type: 'udm' }])(
		'keeps disabled or unsupported devices on/off only: %j', overrides => {
			const enabled = Object.keys(overrides).length !== 0
			const f = fixture(overrides, enabled)
			expect(f.light.testCharacteristic(hap.Characteristic.On)).toBe(true)
			for (const c of [hap.Characteristic.Hue, hap.Characteristic.Saturation, hap.Characteristic.Brightness]) {
				expect(f.light.testCharacteristic(c)).toBe(false)
			}
			expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
		})

	it('preserves colour and brightness on a first on/off write without any GET', async () => {
		vi.useFakeTimers()
		const f = fixture()
		await flush(f.control.setOn(false))
		expect(f.platform.sessionManager.request).toHaveBeenCalledExactlyOnceWith({ method: 'put', url: '/proxy/network/api/s/default/rest/device/synthetic-ap', data: { led_override: 'off' } })
		expect(f.cache.getDeviceById(device._id)).toMatchObject({ led_override_color: '#0000ff', led_override_color_brightness: '75' })
	})

	it('a first brightness change does not change colour or turn the LED off', async () => {
		vi.useFakeTimers()
		const f = fixture()
		await flush(f.control.setBrightness(50))
		expect(f.platform.sessionManager.request.mock.calls[0][0].data).toEqual({ led_override_color_brightness: 50 })
		expect(f.cache.getDeviceById(device._id)).toMatchObject({ led_override: 'on', led_override_color: '#0000ff' })
		expect(f.light.getCharacteristic(hap.Characteristic.On).value).toBe(true)
	})

	it('merges hue, saturation, brightness and On into a single LED-only request', async () => {
		vi.useFakeTimers()
		const f = fixture()
		await flush(Promise.all([f.control.setHue(120), f.control.setSaturation(100), f.control.setBrightness(40), f.control.setOn(true)]))
		expect(f.platform.sessionManager.request).toHaveBeenCalledOnce()
		expect(f.platform.sessionManager.request.mock.calls[0][0].data).toEqual({ led_override: 'on', led_override_color: '#00ff00', led_override_color_brightness: 40 })
		expect(await f.control.getHue()).toBe(120)
		expect(await f.control.getBrightness()).toBe(40)
	})

	it('uses cached saturation when changing hue and preserves brightness', async () => {
		vi.useFakeTimers()
		const f = fixture({ led_override_color: '#ff8080' })
		await flush(f.control.setHue(120))
		expect(f.platform.sessionManager.request.mock.calls[0][0].data).toEqual({ led_override_color: '#80ff80' })
		expect(f.cache.getDeviceById(device._id)?.led_override_color_brightness).toBe('75')
	})

	it('uses cached hue when changing saturation', async () => {
		vi.useFakeTimers()
		const f = fixture()
		await flush(f.control.setSaturation(0))
		expect(f.platform.sessionManager.request.mock.calls[0][0].data).toEqual({ led_override_color: '#ffffff' })
	})

	it('treats Hue360 as red', async () => {
		vi.useFakeTimers()
		const f = fixture()
		await flush(f.control.setHue(360))
		expect(f.platform.sessionManager.request.mock.calls[0][0].data).toEqual({ led_override_color: '#ff0000' })
	})

	it('retains the standalone controller route without endpoint probes', async () => {
		vi.useFakeTimers()
		const f = fixture({}, true, UnifiApiType.SelfHosted)
		await flush(f.control.setBrightness(10))
		expect(f.platform.sessionManager.request).toHaveBeenCalledExactlyOnceWith({ method: 'put', url: '/api/s/default/rest/device/synthetic-ap', data: { led_override_color_brightness: 10 } })
	})

	it.each([{ status: 500, data: {} }, { status: 200, data: { meta: { rc: 'error' } } }])(
		'rejects unaccepted writes for every HomeKit caller', async response => {
			vi.useFakeTimers()
			const f = fixture()
			f.platform.sessionManager.request.mockResolvedValue(response)
			const result = Promise.allSettled([f.control.setHue(120), f.control.setBrightness(50)])
			await vi.advanceTimersByTimeAsync(50)
			expect((await result).map(r => r.status)).toEqual(['rejected', 'rejected'])
			expect(f.cache.getDeviceById(device._id)).toBeUndefined()
			for (const c of [hap.Characteristic.On, hap.Characteristic.Hue, hap.Characteristic.Saturation, hap.Characteristic.Brightness]) {
				expect(f.light.getCharacteristic(c).statusCode).not.toBe(0)
			}
		})

	it('clears errors when normal discovery restores valid state', async () => {
		const f = fixture({ led_override_color: 'invalid', led_override_color_brightness: 'invalid' })
		await expect(f.control.getHue()).rejects.toThrow('Not Responding')
		expect(await f.control.getOn()).toBe(true)
		f.cache.setDevice(device)
		restoreAccessory(f.platform as any, device, f.accessory)
		expect(f.light.getCharacteristic(hap.Characteristic.Hue).statusCode).toBe(0)
		expect(await f.control.getBrightness()).toBe(75)
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it('reconciles capability changes using normal discovery and retains pairing', () => {
		const f = fixture()
		const uuid = f.accessory.UUID
		const next = { ...device, hw_caps: 20480, model: 'U7PRO', version: '2' }
		f.cache.setDevice(next)
		restoreAccessory(f.platform as any, next, f.accessory)
		expect(f.light.testCharacteristic(hap.Characteristic.Hue)).toBe(false)
		f.cache.setDevice(device)
		restoreAccessory(f.platform as any, device, f.accessory)
		expect(f.light.testCharacteristic(hap.Characteristic.Hue)).toBe(true)
		expect(f.accessory.UUID).toBe(uuid)
		expect(f.platform.api.registerPlatformAccessories).toHaveBeenCalledOnce()
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it('removes cached RGB controls when the opt-in setting is turned off', () => {
		const f = fixture()
		f.platform.config.enableRgb = false
		restoreAccessory(f.platform as any, device, f.accessory)
		expect(f.light.testCharacteristic(hap.Characteristic.Hue)).toBe(false)
		expect(f.light.testCharacteristic(hap.Characteristic.Brightness)).toBe(false)
	})

	it('does not cancel a pending update on an unchanged discovery refresh', async () => {
		vi.useFakeTimers()
		const f = fixture()
		const pending = f.control.setHue(120)
		f.cache.setDevice({ ...device })
		restoreAccessory(f.platform as any, { ...device }, f.accessory)
		await flush(pending)
		expect(f.platform.sessionManager.request).toHaveBeenCalledOnce()
		expect(await f.control.getHue()).toBe(120)
	})

	it('cancels pending writes on a firmware/capability change', async () => {
		vi.useFakeTimers()
		const f = fixture()
		const result = Promise.allSettled([f.control.setHue(120)])
		const next = { ...device, version: '2', hw_caps: 20480 }
		f.cache.setDevice(next)
		restoreAccessory(f.platform as any, next, f.accessory)
		await vi.advanceTimersByTimeAsync(50)
		expect((await result)[0].status).toBe('rejected')
		expect(f.cache.getDeviceById(device._id)).toBe(next)
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it('cancels an excluded accessory before any queued write', async () => {
		vi.useFakeTimers()
		const f = fixture()
		const result = Promise.allSettled([f.control.setHue(120)])
		removeAccessory(f.platform as any, f.accessory)
		await vi.advanceTimersByTimeAsync(50)
		expect((await result)[0].status).toBe('rejected')
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it('preserves refreshed metadata when a write finishes', async () => {
		vi.useFakeTimers()
		const f = fixture()
		f.platform.sessionManager.request.mockImplementation(async () => {
			f.cache.setDevice({ ...device, name: 'Renamed AP', last_seen: 123 })
			return { status: 200, data: { meta: { rc: 'ok' } } }
		})
		await flush(f.control.setHue(120))
		expect(f.cache.getDeviceById(device._id)).toMatchObject({ name: 'Renamed AP', last_seen: 123, led_override_color: '#00ff00' })
	})

	it('does not overwrite a device moved to another site during a write', async () => {
		vi.useFakeTimers()
		const f = fixture()
		f.platform.sessionManager.request.mockImplementation(async () => {
			f.cache.setDevice({ ...device, site: 'other-site', led_override_color: '#ff0000' })
			return { status: 200, data: { meta: { rc: 'ok' } } }
		})
		await flush(f.control.setHue(120))
		expect(f.cache.getDeviceById(device._id)).toMatchObject({ site: 'other-site', led_override_color: '#ff0000' })
	})

	it('rejects invalid HomeKit values before queueing a request', async () => {
		const f = fixture()
		await expect(f.control.setHue(361)).rejects.toThrow('Invalid LED')
		await expect(f.control.setSaturation(-1)).rejects.toThrow('Invalid LED')
		await expect(f.control.setBrightness('50')).rejects.toThrow('Invalid LED')
		await expect(f.control.setBrightness(101)).rejects.toThrow('integer between')
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})
	it('classifies capability once, then only on changed discovery evidence', async () => {
		const classify = vi.spyOn(capabilities, 'hasRgbLedCapability')
		const f = fixture()
		expect(classify).toHaveBeenCalledOnce()
		for (let i = 0; i < 3; i++) {
			const next = { ...device, led_override_color: '#00ff00', last_seen: i }
			f.cache.setDevice(next)
			restoreAccessory(f.platform as any, next, f.accessory)
			await f.control.getHue()
		}
		expect(classify).toHaveBeenCalledOnce()
		const firmware = { ...device, version: '2' }
		f.cache.setDevice(firmware)
		restoreAccessory(f.platform as any, firmware, f.accessory)
		expect(classify).toHaveBeenCalledTimes(2)
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it('handles native HomeKit requests using the same accessory and UUID', async () => {
		vi.useFakeTimers()
		const f = fixture()
		const hue = f.light.getCharacteristic(hap.Characteristic.Hue)
		await flush(hue.handleSetRequest(120, undefined))
		expect(await hue.handleGetRequest(undefined)).toBe(120)
		expect(f.platform.sessionManager.request).toHaveBeenCalledOnce()
		expect(f.accessory.UUID).toBe(hap.uuid.generate(device._id))
	})

	it('treats an absent RGB setting as disabled', () => {
		const f = fixture()
		delete (f.platform.config as { enableRgb?: boolean }).enableRgb
		restoreAccessory(f.platform as any, device, f.accessory)
		expect(f.light.testCharacteristic(hap.Characteristic.Hue)).toBe(false)
	})

	it('preserves zero brightness and a black saved colour on on/off', async () => {
		vi.useFakeTimers()
		const f = fixture({ led_override_color: '#000000', led_override_color_brightness: 0 })
		await flush(f.control.setOn(false))
		expect(f.platform.sessionManager.request.mock.calls[0][0].data).toEqual({ led_override: 'off' })
		expect(f.cache.getDeviceById(device._id)).toMatchObject({ led_override_color: '#000000', led_override_color_brightness: 0 })
	})

	it('rejects transport failure and recovers on the next normal discovery', async () => {
		vi.useFakeTimers()
		const f = fixture()
		f.platform.sessionManager.request.mockRejectedValueOnce(new Error('Synthetic network failure'))
		const result = Promise.allSettled([f.control.setHue(120)])
		await vi.advanceTimersByTimeAsync(50)
		expect((await result)[0].status).toBe('rejected')
		f.cache.setDevice(device)
		restoreAccessory(f.platform as any, device, f.accessory)
		await flush(f.control.setHue(120))
		expect(await f.control.getHue()).toBe(120)
		expect(f.platform.sessionManager.request).toHaveBeenCalledTimes(2)
	})

	it('does not apply an in-flight acknowledgement after shutdown', async () => {
		vi.useFakeTimers()
		const f = fixture()
		let finish!: (value: unknown) => void
		f.platform.sessionManager.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
		const result = Promise.allSettled([f.control.setHue(120)])
		await vi.advanceTimersByTimeAsync(50)
		f.control.shutdown()
		expect((await result)[0].status).toBe('rejected')
		finish({ status: 200, data: { meta: { rc: 'ok' } } })
		await vi.advanceTimersByTimeAsync(100)
		expect(f.cache.getDeviceById(device._id)?.led_override_color).toBe('#0000ff')
	})

	it('rejects unsupported colour requests without invalidating working on/off controls', async () => {
		const f = fixture({ model: 'U7PRO', hw_caps: 20480 })
		await expect(f.control.setHue(120)).rejects.toThrow('Not Responding')
		expect(await f.control.getOn()).toBe(true)
		expect(f.cache.getDeviceById(device._id)).toBeDefined()
		expect(f.light.getCharacteristic(hap.Characteristic.On).statusCode).toBe(0)
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it('does not send a cancelled update after cache recovery changes firmware', async () => {
		vi.useFakeTimers()
		const f = fixture()
		f.cache.clear()
		f.platform.forceImmediateCacheRefresh.mockImplementation(async () => {
			const recovered = { ...device, version: '2' }
			f.cache.setDevice(recovered)
			restoreAccessory(f.platform as any, recovered, f.accessory)
		})
		const result = Promise.allSettled([f.control.setHue(120)])
		await vi.advanceTimersByTimeAsync(50)
		expect((await result)[0].status).toBe('rejected')
		expect(f.cache.getDeviceById(device._id)?.version).toBe('2')
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

})
