import { afterEach, describe, expect, it, vi } from 'vitest'
import * as hap from 'hap-nodejs'
import { createAndRegisterAccessory, restoreAccessory, removeAccessory, stopAccessoryControls } from '../../src/accessory/accessoryFactory.js'
import { UniFiAP } from '../../src/accessory/platformAccessory.js'
import { DeviceCache } from '../../src/cache/deviceCache.js'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'

const device = { _id: 'synthetic-ap', mac: '00:00:00:00:00:00', site: 'default', type: 'uap',
	model: 'Test', name: 'Test AP', serial: 'synthetic', version: '1', led_override: 'off' }
class TestAccessory extends hap.Accessory { context: any = {} }
function fixture() {
	const cache = new DeviceCache()
	cache.setDevices([{ ...device }])
	const helper = new UnifiApiHelper()
	helper.setApiType(UnifiApiType.UnifiOS)
	const platform = { config: {}, Service: hap.Service, Characteristic: hap.Characteristic,
		accessories: [], getDeviceCache: () => cache, isShuttingDown: false,
		log: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(k => [k, vi.fn()])),
		api: { platformAccessory: TestAccessory, registerPlatformAccessories: vi.fn(),
			unregisterPlatformAccessories: vi.fn(), updatePlatformAccessories: vi.fn() },
		sessionManager: { getApiHelper: () => helper, request: vi.fn().mockResolvedValue({ status: 200, data: { meta: { rc: 'ok' } } }) },
	}
	return { cache, platform }
}
afterEach(() => vi.restoreAllMocks())

describe('accessory handler lifecycle', () => {
	it('keeps the same control and pairing identity across discovery refreshes', () => {
		const f = fixture()
		const refresh = vi.spyOn(UniFiAP.prototype, 'refresh')
		const accessory = createAndRegisterAccessory(f.platform as any, device, hap.uuid.generate(device._id))
		const uuid = accessory.UUID
		const next = { ...device, version: '2', name: 'Renamed AP' }
		f.cache.setDevice(next)
		restoreAccessory(f.platform as any, next, accessory)
		expect(refresh.mock.contexts[0]).toBe(refresh.mock.contexts[1])
		expect((refresh.mock.contexts[1] as UniFiAP).accessPoint.version).toBe('2')
		expect(accessory.UUID).toBe(uuid)
		expect(f.platform.api.registerPlatformAccessories).toHaveBeenCalledOnce()
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
	})

	it('stops controls when an accessory is excluded', async () => {
		const f = fixture()
		const refresh = vi.spyOn(UniFiAP.prototype, 'refresh')
		const accessory = createAndRegisterAccessory(f.platform as any, device, hap.uuid.generate(device._id))
		const control = refresh.mock.contexts[0] as UniFiAP
		removeAccessory(f.platform as any, accessory)
		await expect(control.setOn(true)).rejects.toThrow('Not Responding')
		expect(f.platform.sessionManager.request).not.toHaveBeenCalled()
		expect(f.platform.accessories).toHaveLength(0)
	})

	it('stops all controls without creating per-device shutdown listeners', async () => {
		const f = fixture()
		const refresh = vi.spyOn(UniFiAP.prototype, 'refresh')
		createAndRegisterAccessory(f.platform as any, device, hap.uuid.generate(device._id))
		const control = refresh.mock.contexts[0] as UniFiAP
		stopAccessoryControls(f.platform as any)
		await expect(control.getOn()).rejects.toThrow('Not Responding')
	})
})
