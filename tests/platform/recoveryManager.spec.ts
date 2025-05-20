import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RecoveryManager } from '../../src/platform/recoveryManager.js'
import { UnifiAuthError } from '../../src/models/unifiTypes.js'
import { getMockDeviceCache } from '../fixtures/deviceCacheMocks'
import * as unifiModule from '../../src/unifi'

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
		vi.clearAllMocks()
		sessionManager = {
			authenticate: vi.fn().mockResolvedValue(undefined),
			getSiteName: vi.fn(site => site),
			getApiHelper: vi.fn(() => ({})),
			request: vi.fn()
		}
		refreshDeviceCache = vi.fn().mockResolvedValue(undefined)
		log = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		}
		// Do not assign recoveryManager here; each test will create its own instance as needed
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('should call authenticate and refreshDeviceCache and log success (fallback path, platform but no getDeviceCache)', async () => {
		vi.clearAllMocks()
		refreshDeviceCache.mockClear()
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
		expect(log.info).toHaveBeenCalledWith('Immediate cache refresh requested (triggered by accessory error).')
		expect(log.info).toHaveBeenCalledWith('Device cache refreshed after recovery (fallback to full cache refresh).')
		expect(log.info).toHaveBeenCalledWith('Immediate cache refresh completed successfully.')
	})

	it('should log error if authenticate throws', async () => {
		const mockDeviceCache = getMockDeviceCache()
		const platform = { config: {}, getDeviceCache: () => mockDeviceCache }
		const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
		sessionManager.authenticate.mockRejectedValueOnce(new UnifiAuthError('fail'))
		await recoveryManager.forceImmediateCacheRefresh()
		expect(log.error).toHaveBeenCalledWith('Immediate cache refresh failed:', expect.any(UnifiAuthError))
	})

	it('should log error if refreshDeviceCache throws', async () => {
		const mockDeviceCache = getMockDeviceCache()
		const platform = { config: {}, getDeviceCache: () => mockDeviceCache }
		const recoveryManager = new TestRecoveryManager(sessionManager, refreshDeviceCache, log, platform)
		refreshDeviceCache.mockRejectedValueOnce(new Error('fail2'))
		await recoveryManager.forceImmediateCacheRefresh()
		expect(log.error).toHaveBeenCalledWith('Immediate cache refresh failed:', expect.any(Error))
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
		expect(log.info).toHaveBeenCalledWith('Immediate cache refresh requested (triggered by accessory error).')
		expect(log.info).toHaveBeenCalledWith(`Device cache refreshed after recovery. ${readyAps.length} devices are ready and available.`)
		expect(log.info).toHaveBeenCalledWith('Immediate cache refresh completed successfully.')
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
		if (mockDeviceCache.setDevices.mock.calls.length > 0) {
			console.log('setDevices called with:', mockDeviceCache.setDevices.mock.calls)
		}
		expect(sessionManager.authenticate).toHaveBeenCalled()
		expect(mockDeviceCache.setDevices).not.toHaveBeenCalled()
		expect(log.warn).toHaveBeenCalledWith('No relevant UniFi APs are ready after controller recovery. Will not update cache or accessories.')
	})
})
