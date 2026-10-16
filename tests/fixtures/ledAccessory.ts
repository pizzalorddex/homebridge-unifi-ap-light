import { vi } from 'vitest'
import * as hap from 'hap-nodejs'
import { UniFiAP } from '../../src/accessory/platformAccessory.js'
import { DeviceCache } from '../../src/cache/deviceCache.js'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { createAndRegisterAccessory } from '../../src/accessory/accessoryFactory.js'

export const device = { _id: 'synthetic-ap', mac: '00:00:00:00:00:00', site: 'default', type: 'uap',
	model: 'Test RGB AP', name: 'Test AP', serial: 'synthetic', version: '1', hw_caps: 2562,
	led_override: 'on', led_override_color: '#0000ff', led_override_color_brightness: '75' }
class TestAccessory extends hap.Accessory { context: any = {} }
export function fixture(overrides = {}, enabled = true, apiType = UnifiApiType.UnifiOS, enableBrightness?: boolean) {
	const ap = { ...device, ...overrides }
	const cache = new DeviceCache()
	cache.setDevices([ap])
	const helper = new UnifiApiHelper()
	helper.setApiType(apiType)
	const platform = { config: { enableRgb: enabled, enableBrightness }, Service: hap.Service, Characteristic: hap.Characteristic,
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
