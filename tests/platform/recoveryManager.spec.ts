import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RecoveryManager } from '../../src/platform/recoveryManager.js'
import { UnifiAuthError } from '../../src/models/unifiTypes.js'
import { getMockDeviceCache } from '../fixtures/deviceCacheMocks'
import { mockLogger, makeSessionManager, mockRefreshDeviceCache } from '../fixtures/homebridgeMocks'
import * as unifiModule from '../../src/unifi'
import { resetErrorState } from '../../src/utils/errorLogManager.js'

describe('RecoveryManager', () => {
	let sessionManager: any
	let refreshDeviceCache: any
	let log: any

	class TestRecoveryManager extends RecoveryManager {
		platform: any
		constructor(sessionManager: any, refreshDeviceCache: any, log: any, platform: any) {
			super(sessionManager, refreshDeviceCache, log)
			this.platform = platform
		}
	}

	beforeEach(() => {
		resetErrorState()
		vi.clearAllMocks()
		sessionManager = makeSessionManager()
		refreshDeviceCache = mockRefreshDeviceCache
		log = mockLogger
		// Do not assign recoveryManager here; each test will create its own instance as needed
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('should call authenticate and refreshDeviceCache and log success (fallback path, platform but no getDeviceCache)', async () => {
		// Platform present, but no getDeviceCache function
		const platform = { config: {} }
		const { loadFixture } = await import('../fixtures/apiFixtures')
		const { data } = loadFixture('device-list-success.fixture.json')
		// Only APs (uap/udm) are considered ready devices
		const readyAps = data.filter((d: any) => d.type === 'uap' || d.type === 'udm')
		vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue(readyAps)
		const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
		await recoveryManager.forceImmediateCacheRefresh()
		expect(sessionManager.authenticate).toHaveBeenCalled()
		expect(refreshDeviceCache).toHaveBeenCalled()
		expect(log.error).toHaveBeenCalledTimes(2)
		expect(log.error).toHaveBeenNthCalledWith(1, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh requested (triggered by accessory error).')
		expect(log.error).toHaveBeenNthCalledWith(2, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh completed successfully.')
		expect(log.debug).toHaveBeenCalledWith('[Cache Refresh] Device cache refreshed after recovery (fallback to full cache refresh).')
	})

	it('should log error if authenticate throws', async () => {
		const mockDeviceCache = getMockDeviceCache()
		const platform = { config: {}, getDeviceCache: () => mockDeviceCache }
		const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
		sessionManager.authenticate.mockRejectedValueOnce(new UnifiAuthError('fail'))
		await recoveryManager.forceImmediateCacheRefresh()
		expect(log.error).toHaveBeenCalledTimes(2)
		expect(log.error).toHaveBeenNthCalledWith(1, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh requested (triggered by accessory error).')
		expect(log.error).toHaveBeenNthCalledWith(2, expect.stringContaining('Immediate cache refresh failed'))
	})

	it('should log error if refreshDeviceCache throws', async () => {
		const mockDeviceCache = getMockDeviceCache()
		const platform = { config: {}, getDeviceCache: () => mockDeviceCache }
		const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
		refreshDeviceCache.mockRejectedValueOnce(new Error('fail2'))
		await recoveryManager.forceImmediateCacheRefresh()
		expect(log.error).toHaveBeenCalledTimes(2)
		expect(log.error).toHaveBeenNthCalledWith(1, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh requested (triggered by accessory error).')
		expect(log.error).toHaveBeenNthCalledWith(2, expect.stringContaining('Immediate cache refresh failed'))
	})

	it('should call authenticate, setDevices, and log success (happy path, with platform)', async () => {
		const mockDeviceCache = getMockDeviceCache()
		const platform = { config: {}, getDeviceCache: () => mockDeviceCache }
		const { loadFixture } = await import('../fixtures/apiFixtures')
		const { data } = loadFixture('device-list-success.fixture.json')
		const readyAps = data.filter((d: any) => d.type === 'uap' || d.type === 'udm')
		vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue(readyAps)
		const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
		await recoveryManager.forceImmediateCacheRefresh()
		expect(sessionManager.authenticate).toHaveBeenCalled()
		expect(mockDeviceCache.setDevices).toHaveBeenCalledWith(readyAps)
		expect(log.error).toHaveBeenCalledTimes(2)
		expect(log.error).toHaveBeenNthCalledWith(1, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh requested (triggered by accessory error).')
		expect(log.error).toHaveBeenNthCalledWith(2, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh completed successfully.')
		expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('[Cache Refresh] Device cache refreshed after recovery.'))
	})

	it('should warn and not update cache if no APs are ready', async () => {
		vi.clearAllMocks()
		const mockDeviceCache = getMockDeviceCache()
		mockDeviceCache.setDevices.mockClear()
		const platform = { config: {}, getDeviceCache: () => mockDeviceCache }
		const { loadFixture } = await import('../fixtures/apiFixtures')
		const { data } = loadFixture('device-list-success.fixture.json')
		// Patch all devices to not ready
		const notReady = data.map(d => ({ ...d, last_seen: 0, uptime: 0 }))
		vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue(notReady)
		const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
		await recoveryManager.forceImmediateCacheRefresh()
		expect(sessionManager.authenticate).toHaveBeenCalled()
		expect(mockDeviceCache.setDevices).not.toHaveBeenCalled()
		expect(log.error).toHaveBeenCalledTimes(2)
		expect(log.error).toHaveBeenNthCalledWith(1, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh requested (triggered by accessory error).')
		expect(log.error).toHaveBeenNthCalledWith(2, '[API] Error [endpoint: forceImmediateCacheRefresh]: No relevant UniFi APs are ready after controller recovery. Will not update cache or accessories.')
	})

	// --- branch/edge cases for coverage ---
	describe('branch/edge cases', () => {
		it('covers constructor', () => {
			const rm = new RecoveryManager(sessionManager, refreshDeviceCache, log)
			expect(rm).toBeInstanceOf(RecoveryManager)
		})

		it('handles missing platform property (platform = undefined, configSites = ["default"] fallback)', async () => {
			const recoveryManager = new RecoveryManager(sessionManager, refreshDeviceCache, log)
			sessionManager.getSiteName = vi.fn(site => site === 'default' ? 'default' : undefined)
			vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue([{ type: 'uap', model: 'U7', _id: '1', last_seen: 1, uptime: 1 } as any])
			await recoveryManager.forceImmediateCacheRefresh()
			expect(refreshDeviceCache).toHaveBeenCalled()
			expect(log.error).toHaveBeenCalledTimes(2)
			expect(log.error).toHaveBeenNthCalledWith(1, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh requested (triggered by accessory error).')
			expect(log.error).toHaveBeenNthCalledWith(2, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh completed successfully.')
			expect(log.debug).toHaveBeenCalledWith('[Cache Refresh] Device cache refreshed after recovery (fallback to full cache refresh).')
		})

		it('handles platform.config.sites present but empty (configSites = ["default"] fallback)', async () => {
			const platform = { config: { sites: [] } }
			const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
			sessionManager.getSiteName = vi.fn(site => site === 'default' ? 'default' : undefined)
			vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue([{ type: 'uap', model: 'U7', _id: '1', last_seen: 1, uptime: 1 } as any])
			await recoveryManager.forceImmediateCacheRefresh()
			expect(refreshDeviceCache).toHaveBeenCalled()
		})

		it('handles platform.config present but missing sites (configSites = ["default"] fallback)', async () => {
			const platform = { config: {} }
			const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
			sessionManager.getSiteName = vi.fn(site => site === 'default' ? 'default' : undefined)
			vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue([{ type: 'uap', model: 'U7', _id: '1', last_seen: 1, uptime: 1 } as any])
			await recoveryManager.forceImmediateCacheRefresh()
			expect(refreshDeviceCache).toHaveBeenCalled()
		})

		it('handles all sites failing to resolve (resolvedSites.length === 0)', async () => {
			const platform = { config: { sites: ['site1', 'site2'] } }
			const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
			sessionManager.getSiteName = vi.fn(() => undefined)
			await recoveryManager.forceImmediateCacheRefresh()
			expect(log.error).toHaveBeenCalledTimes(2)
			expect(log.error).toHaveBeenNthCalledWith(1, '[API] Error [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh requested (triggered by accessory error).')
			expect(log.error).toHaveBeenNthCalledWith(2, '[API] Error [endpoint: forceImmediateCacheRefresh]: No valid sites resolved. Aborting recovery cache refresh.')
		})

		it('handles platform present but missing config (configSites = ["default"] fallback)', async () => {
			const platform = {}
			const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
			sessionManager.getSiteName = vi.fn(site => site === 'default' ? 'default' : undefined)
			vi.spyOn(unifiModule, 'getAccessPoints').mockResolvedValue([{ type: 'uap', model: 'U7', _id: '1', last_seen: 1, uptime: 1 } as any])
			await recoveryManager.forceImmediateCacheRefresh()
			expect(refreshDeviceCache).toHaveBeenCalled()
		})
	})
})
