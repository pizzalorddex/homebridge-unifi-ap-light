import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecoveryManager } from '../../src/platform/recoveryManager.js'
import { UnifiAuthError } from '../../src/models/unifiTypes.js'
import { getMockDeviceCache } from '../fixtures/deviceCacheMocks.js'
import { makeSessionManager, mockLogger } from '../fixtures/homebridgeMocks.js'
import * as unifiModule from '../../src/unifi.js'
import { resetErrorState } from '../../src/utils/errorLogManager.js'

describe('RecoveryManager', () => {
	let sessionManager: ReturnType<typeof makeSessionManager>
	let deviceCache: ReturnType<typeof getMockDeviceCache>
	let platform: any

	beforeEach(() => {
		resetErrorState()
		vi.clearAllMocks()
		sessionManager = makeSessionManager()
		deviceCache = getMockDeviceCache()
		platform = {
			config: {},
			sessionManager,
			log: mockLogger,
			getDeviceCache: () => deviceCache,
		}
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('updates the cache after the controller recovers', async () => {
		const devices = [readyAccessPoint('ap1')]
		vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue(devices)

		await new RecoveryManager(platform).forceImmediateCacheRefresh()

		expect(sessionManager.authenticate).toHaveBeenCalledOnce()
		expect(deviceCache.setDevices).toHaveBeenCalledWith(devices)
	})

	it('uses configured sites', async () => {
		platform.config.sites = ['Upstairs', 'Downstairs']
		sessionManager.getSiteName = vi.fn(site => site.toLowerCase())
		const getAccessPoints = vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue([readyAccessPoint('ap1')])

		await new RecoveryManager(platform).forceImmediateCacheRefresh()

		expect(getAccessPoints).toHaveBeenCalledWith(
			expect.any(Function),
			expect.anything(),
			['upstairs', 'downstairs'],
			mockLogger
		)
	})

	it('uses the default site when no sites are configured', async () => {
		const getAccessPoints = vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue([readyAccessPoint('ap1')])

		await new RecoveryManager(platform).forceImmediateCacheRefresh()

		expect(sessionManager.getSiteName).toHaveBeenCalledWith('default')
		expect(getAccessPoints).toHaveBeenCalled()
	})

	it('applies include and exclude filters', async () => {
		platform.config.includeIds = ['ap1', 'ap2']
		platform.config.excludeIds = ['ap2']
		vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue([
			readyAccessPoint('ap1'),
			readyAccessPoint('ap2'),
			readyAccessPoint('ap3'),
		])

		await new RecoveryManager(platform).forceImmediateCacheRefresh()

		expect(deviceCache.setDevices).toHaveBeenCalledWith([readyAccessPoint('ap1')])
	})

	it('keeps the current cache when no AP is ready', async () => {
		vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue([
			{ ...readyAccessPoint('ap1'), last_seen: 0, uptime: 0, state: 0 },
		])

		await new RecoveryManager(platform).forceImmediateCacheRefresh()

		expect(deviceCache.setDevices).not.toHaveBeenCalled()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No relevant UniFi APs are ready'))
	})

	it('stops when no configured site can be resolved', async () => {
		platform.config.sites = ['missing']
		sessionManager.getSiteName = vi.fn(() => undefined)
		const getAccessPoints = vi.spyOn(unifiModule, 'getAccessPoints')

		await new RecoveryManager(platform).forceImmediateCacheRefresh()

		expect(getAccessPoints).not.toHaveBeenCalled()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No valid sites resolved'))
	})

	it('reports authentication failures', async () => {
		sessionManager.authenticate.mockRejectedValueOnce(new UnifiAuthError('login failed'))

		await new RecoveryManager(platform).forceImmediateCacheRefresh()

		expect(deviceCache.setDevices).not.toHaveBeenCalled()
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Immediate cache refresh failed'))
	})

	it('shares one recovery attempt across concurrent calls', async () => {
		vi.spyOn(unifiModule, 'getAccessPoints').mockImplementation(async () => {
			await new Promise(resolve => setTimeout(resolve, 25))
			return [readyAccessPoint('ap1')]
		})
		const recoveryManager = new RecoveryManager(platform)

		await Promise.all([
			recoveryManager.forceImmediateCacheRefresh(),
			recoveryManager.forceImmediateCacheRefresh(),
		])

		expect(sessionManager.authenticate).toHaveBeenCalledOnce()
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('already in progress'))
	})
})

function readyAccessPoint(id: string) {
	return {
		_id: id,
		mac: `00:00:00:00:00:${id.slice(-1)}`,
		site: 'default',
		type: 'uap',
		model: 'U7',
		name: id,
		serial: id,
		version: '1.0.0',
		last_seen: 1,
		uptime: 1,
		state: 1,
	}
}
