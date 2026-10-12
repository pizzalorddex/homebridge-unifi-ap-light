import { afterEach, describe, expect, it, vi } from 'vitest'
import * as hap from 'hap-nodejs'
import { UnifiAPLight } from '../../src/platform.js'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { mockLogger } from '../fixtures/homebridgeMocks.js'

const ap = { _id: 'synthetic-ap', mac: '00:00:00:00:00:00', site: 'default', type: 'uap',
	model: 'Test', name: 'Test AP', serial: 'synthetic', version: '1', led_override: 'off', state: 1 }
class TestAccessory extends hap.Accessory { context: any = {} }

function fixture() {
	const callbacks = new Map<string, () => void>()
	const api = { hap, platformAccessory: TestAccessory, on: (event: string, fn: () => void) => callbacks.set(event, fn),
		registerPlatformAccessories: vi.fn(), unregisterPlatformAccessories: vi.fn(), updatePlatformAccessories: vi.fn() }
	const platform = new UnifiAPLight(mockLogger as any, { platform: 'UnifiAPLight', name: 'Test',
		host: 'example.invalid', username: 'synthetic', password: 'synthetic', refreshIntervalMinutes: 1 }, api as any)
	const helper = new UnifiApiHelper()
	helper.setApiType(UnifiApiType.UnifiOS)
	let available = false
	let knownSite = false
	let devices = [{ ...ap }]
	const session = { authenticate: vi.fn(async () => {
		if (!available) {
			throw new Error('Controller unavailable')
		}
		knownSite = true
	}), getApiHelper: () => helper, getSiteName: () => knownSite ? 'default' : undefined,
	request: vi.fn(async () => {
		if (!available) {
			throw new Error('Controller unavailable')
		}
		return { status: 200, data: { meta: { rc: 'ok' }, data: devices.map(device => ({ ...device })) } }
	}) }
	platform.sessionManager = session as any
	return { platform, api, session, callbacks, online: (value: boolean) => { available = value },
		devices: (value: typeof devices) => { devices = value } }
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('Controller recovery with real HomeKit services', () => {
	it('discovers a fresh installation after failed startup without a restart', async () => {
		vi.useFakeTimers()
		const f = fixture()
		f.callbacks.get('didFinishLaunching')!()
		await vi.advanceTimersByTimeAsync(0)
		expect(f.api.registerPlatformAccessories).not.toHaveBeenCalled()
		f.online(true)
		await vi.advanceTimersByTimeAsync(60_000)
		expect(f.api.registerPlatformAccessories).toHaveBeenCalledOnce()
		const accessory = f.platform.accessories[0]
		expect(await accessory.getService(hap.Service.Lightbulb)!.getCharacteristic(hap.Characteristic.On).handleGetRequest()).toBe(false)
		f.callbacks.get('shutdown')!()
	})

	it('restores cached handlers after failed startup and preserves identity', async () => {
		const f = fixture()
		const cached = new TestAccessory(ap.name, hap.uuid.generate(ap._id))
		cached.context.accessPoint = { ...ap }
		cached.addService(hap.Service.Lightbulb)
		f.platform.configureAccessory(cached as any)
		await f.platform.discoverDevices()
		f.online(true)
		await f.platform.refreshDeviceCache()
		const on = cached.getService(hap.Service.Lightbulb)!.getCharacteristic(hap.Characteristic.On)
		expect(on.getHandler).toBeDefined()
		expect(on.setHandler).toBeDefined()
		expect(await on.handleGetRequest()).toBe(false)
		expect(f.platform.accessories[0].UUID).toBe(hap.uuid.generate(ap._id))
		expect(f.api.registerPlatformAccessories).not.toHaveBeenCalled()
		expect(f.api.unregisterPlatformAccessories).not.toHaveBeenCalled()
	})

	it('recovers an outage and adds newly discovered APs without duplicates', async () => {
		const f = fixture()
		f.online(true)
		await f.platform.discoverDevices()
		const first = f.platform.accessories[0]
		f.online(false)
		await f.platform.refreshDeviceCache()
		expect(f.platform.getDeviceCache().getAllDevices()).toHaveLength(0)
		expect(f.api.unregisterPlatformAccessories).not.toHaveBeenCalled()
		f.online(true)
		f.devices([{ ...ap, version: '2' }, { ...ap, _id: 'new-ap' }])
		await f.platform.forceImmediateCacheRefresh()
		await f.platform.refreshDeviceCache()
		expect(f.platform.accessories).toHaveLength(2)
		expect(f.platform.accessories[0]).toBe(first)
		expect(first.context.accessPoint.version).toBe('2')
		expect(first.getService(hap.Service.Lightbulb)!.getCharacteristic(hap.Characteristic.On).statusCode).toBe(0)
		expect(await first.getService(hap.Service.Lightbulb)!.getCharacteristic(hap.Characteristic.On).handleGetRequest()).toBe(false)
	})

	it('shares an in-flight refresh with concurrent recovery callers', async () => {
		const f = fixture()
		f.online(true)
		await f.platform.discoverDevices()
		let finish!: () => void
		const gate = new Promise<void>(resolve => { finish = resolve })
		f.session.request.mockImplementationOnce(async () => { await gate; return { status: 200, data: { meta: { rc: 'ok' }, data: [{ ...ap }] } } })
		f.session.request.mockClear()
		let completed = false
		const first = f.platform.refreshDeviceCache()
		const second = f.platform.forceImmediateCacheRefresh().then(() => { completed = true })
		await Promise.resolve()
		await Promise.resolve()
		expect(completed).toBe(false)
		finish()
		await Promise.all([first, second])
		expect(f.session.request).toHaveBeenCalledOnce()
		expect(completed).toBe(true)
	})

	it('preserves include/exclude filters on subsequent refreshes', async () => {
		const f = fixture()
		f.online(true)
		f.platform.config.excludeIds = ['hidden-ap']
		f.devices([{ ...ap }, { ...ap, _id: 'hidden-ap' }])
		await f.platform.discoverDevices()
		await f.platform.refreshDeviceCache()
		expect(f.platform.accessories).toHaveLength(1)
		expect(f.platform.getDeviceCache().getDeviceById('hidden-ap')).toBeUndefined()
	})

	it('does not register accessories after shutdown during discovery', async () => {
		const f = fixture()
		f.online(true)
		let finish!: () => void
		const gate = new Promise<void>(resolve => { finish = resolve })
		f.session.request.mockImplementation(async () => { await gate; return { status: 200, data: { meta: { rc: 'ok' }, data: [{ ...ap }] } } })
		const pending = f.platform.discoverDevices()
		await Promise.resolve()
		f.callbacks.get('shutdown')!()
		finish()
		await pending
		expect(f.api.registerPlatformAccessories).not.toHaveBeenCalled()
	})
})
