import { afterEach, describe, expect, it, vi } from 'vitest'
import * as hap from 'hap-nodejs'
import { fixture as ledFixture } from '../fixtures/ledAccessory.js'
import { UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { restoreAccessory, removeAccessory } from '../../src/accessory/accessoryFactory.js'
import * as capabilities from '../../src/accessory/ledCapabilities.js'

function fixture(overrides = {}, enabled: boolean | undefined = true, apiType = UnifiApiType.UnifiOS) {
	return ledFixture({ model: 'U7PRO', hw_caps: 20480, ...overrides }, false, apiType, enabled)
}
async function flush(promise: Promise<unknown>) {
	await vi.advanceTimersByTimeAsync(50)
	return promise
}
function expectDimmable(light: hap.Service) {
	expect(light.testCharacteristic(hap.Characteristic.On)).toBe(true)
	expect(light.testCharacteristic(hap.Characteristic.Brightness)).toBe(true)
	for (const type of [hap.Characteristic.Hue, hap.Characteristic.Saturation, hap.Characteristic.ColorTemperature]) {
		expect(light.testCharacteristic(type)).toBe(false)
	}
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('Brightness-only AP controls', () => {
	it('adds only the native brightness characteristic without any network request', async () => {
		const f = fixture()
		expectDimmable(f.light)
		expect(await f.light.getCharacteristic(hap.Characteristic.Brightness).handleGetRequest(undefined)).toBe(75)
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it.each([false, undefined])('keeps brightness opt-in: %s', enabled => {
		const f = fixture()
		f.platform.config.enableBrightness = enabled
		f.control.refresh()
		expect(f.light.testCharacteristic(hap.Characteristic.Brightness)).toBe(false)
		expect(f.light.testCharacteristic(hap.Characteristic.On)).toBe(true)
	})

	it.each([{ model: 'U7PROMAX' }, { model: 'Unknown' }, { type: 'udm' }, { type: 'usw' }])(
		'does not enable unsupported hardware from saved brightness alone: %j', overrides => {
			const f = fixture(overrides)
			expect(f.light.testCharacteristic(hap.Characteristic.Brightness)).toBe(false)
			expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
		})

	it('can expose an RGB-ring AP as dimmable without enabling colour', () => {
		const f = fixture({ model: 'Synthetic RGB', hw_caps: 2 })
		expectDimmable(f.light)
	})

	it.each([0, 1, 10, 100])('handles a native HomeKit brightness write of %s without changing power or colour', async value => {
		vi.useFakeTimers()
		const f = fixture({ led_override: 'off' })
		const characteristic = f.light.getCharacteristic(hap.Characteristic.Brightness)
		await flush(characteristic.handleSetRequest(value, undefined))
		expect(f.platform.sessionManager.request).toHaveBeenCalledExactlyOnceWith({ method: 'put', url: '/proxy/network/api/s/default/rest/device/synthetic-ap', data: { led_override_color_brightness: value } })
		expect(await characteristic.handleGetRequest(undefined)).toBe(value)
		expect(await f.control.getOn()).toBe(false)
		expect(f.cache.getDeviceById('synthetic-ap')).toMatchObject({ led_override: 'off', led_override_color: '#0000ff' })
		expectDimmable(f.light)
	})

	it('merges Home app power and brightness requests into one minimal write', async () => {
		vi.useFakeTimers()
		const f = fixture({ led_override: 'off' })
		await flush(Promise.all([
			f.light.getCharacteristic(hap.Characteristic.On).handleSetRequest(true, undefined),
			f.light.getCharacteristic(hap.Characteristic.Brightness).handleSetRequest(25, undefined),
		]))
		expect(f.platform.sessionManager.request).toHaveBeenCalledExactlyOnceWith({ method: 'put', url: '/proxy/network/api/s/default/rest/device/synthetic-ap', data: { led_override: 'on', led_override_color_brightness: 25 } })
		expect(await f.control.getOn()).toBe(true)
	})

	it('preserves dimming level on power changes', async () => {
		vi.useFakeTimers()
		const f = fixture({ led_override_color_brightness: 10 })
		await flush(f.control.setOn(false))
		await flush(f.control.setOn(true))
		expect(f.platform.sessionManager.request.mock.calls.map(call => call[0].data)).toEqual([{ led_override: 'off' }, { led_override: 'on' }])
		expect(await f.control.getBrightness()).toBe(10)
	})

	it('does not read or write colour when it is absent or invalid', async () => {
		vi.useFakeTimers()
		const f = fixture({ led_override_color: undefined })
		await expect(f.control.setHue(120)).rejects.toThrow('Not Responding')
		await expect(f.control.setSaturation(100)).rejects.toThrow('Not Responding')
		await expect(f.control.getHue()).rejects.toThrow('Not Responding')
		await flush(f.control.setBrightness(30))
		expectDimmable(f.light)
		expect(f.light.getCharacteristic(hap.Characteristic.Brightness).statusCode).toBe(0)
		expect(f.platform.sessionManager.request).toHaveBeenCalledOnce()
	})

	it.each([undefined, 'invalid', -1, 101])('reports unavailable brightness honestly and recovers on discovery: %s', value => {
		const f = fixture({ led_override_color_brightness: value })
		expect(f.light.getCharacteristic(hap.Characteristic.Brightness).statusCode).not.toBe(0)
		const next = { ...f.cache.getDeviceById('synthetic-ap')!, led_override_color_brightness: 40 }
		f.cache.setDevice(next)
		restoreAccessory(f.platform as any, next, f.accessory)
		expect(f.light.getCharacteristic(hap.Characteristic.Brightness).value).toBe(40)
		expect(f.light.getCharacteristic(hap.Characteristic.Brightness).statusCode).toBe(0)
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it.each([-1, 101, 1.5, NaN, Infinity, '50'])('rejects invalid brightness before a request: %s', async value => {
		const f = fixture()
		await expect(f.control.setBrightness(value)).rejects.toThrow()
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it.each([UnifiApiType.SelfHosted, UnifiApiType.UnifiOS])('uses the configured controller route: %s', async apiType => {
		vi.useFakeTimers()
		const f = fixture({}, true, apiType)
		await flush(f.control.setBrightness(10))
		const prefix = apiType === UnifiApiType.UnifiOS ? '/proxy/network' : ''
		expect(f.platform.sessionManager.request.mock.calls[0][0].url).toBe(`${prefix}/api/s/default/rest/device/synthetic-ap`)
	})

	it.each([{ status: 503 }, { status: 200, data: { meta: { rc: 'error' } } }])('propagates controller failures and recovers after discovery: %j', async response => {
		vi.useFakeTimers()
		const f = fixture()
		const original = f.cache.getDeviceById('synthetic-ap')!
		f.platform.sessionManager.request.mockResolvedValueOnce(response)
		const result = Promise.allSettled([f.control.setBrightness(25)])
		await vi.advanceTimersByTimeAsync(50)
		expect((await result)[0].status).toBe('rejected')
		expect(f.light.getCharacteristic(hap.Characteristic.Brightness).statusCode).not.toBe(0)
		expect(f.cache.getDeviceById(original._id)).toBeUndefined()
		f.cache.setDevice(original)
		restoreAccessory(f.platform as any, original, f.accessory)
		await flush(f.control.setBrightness(25))
		expect(await f.control.getBrightness()).toBe(25)
		expectDimmable(f.light)
	})

	it('keeps pairing when switching RGB to dimming to on/off', () => {
		const f = ledFixture({}, true, UnifiApiType.UnifiOS, true)
		const uuid = f.accessory.UUID
		const iid = f.light.UUID
		const next = { ...f.cache.getDeviceById('synthetic-ap')!, model: 'U7PRO', hw_caps: 20480 }
		f.cache.setDevice(next)
		restoreAccessory(f.platform as any, next, f.accessory)
		expectDimmable(f.light)
		f.platform.config.enableBrightness = false
		restoreAccessory(f.platform as any, next, f.accessory)
		expect(f.light.testCharacteristic(hap.Characteristic.Brightness)).toBe(false)
		expect(f.accessory.UUID).toBe(uuid)
		expect(f.accessory.getService(hap.Service.Lightbulb)!.UUID).toBe(iid)
		expect(f.platform.api.registerPlatformAccessories).toHaveBeenCalledOnce()
	})

	it('keeps a slider burst pending during unchanged discovery and writes its latest value', async () => {
		vi.useFakeTimers()
		const classify = vi.spyOn(capabilities, 'hasBrightnessLedCapability')
		const f = fixture()
		const pending = Promise.all([10, 20, 30].map(value => f.control.setBrightness(value)))
		const next = { ...f.cache.getDeviceById('synthetic-ap')!, led_override_color_brightness: 75 }
		f.cache.setDevice(next)
		restoreAccessory(f.platform as any, next, f.accessory)
		await flush(pending)
		expect(classify).toHaveBeenCalledOnce()
		expect(f.platform.sessionManager.request).toHaveBeenCalledOnce()
		expect(await f.control.getBrightness()).toBe(30)
	})

	it.each(['disable', 'firmware', 'site', 'remove', 'shutdown'])('cancels queued brightness on %s', async reason => {
		vi.useFakeTimers()
		const f = fixture()
		const pending = Promise.allSettled([f.control.setBrightness(10)])
		const next = { ...f.cache.getDeviceById('synthetic-ap')! }
		if (reason === 'disable') {
			f.platform.config.enableBrightness = false
		}
		if (reason === 'firmware') {
			next.version = '2'
		}
		if (reason === 'site') {
			next.site = 'other-site'
		}
		if (reason === 'remove') {
			removeAccessory(f.platform as any, f.accessory)
		}
		else if (reason === 'shutdown') {
			f.control.shutdown()
		}
		else {
			f.cache.setDevice(next)
			restoreAccessory(f.platform as any, next, f.accessory)
		}
		await vi.advanceTimersByTimeAsync(100)
		expect((await pending)[0].status).toBe('rejected')
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})
})
