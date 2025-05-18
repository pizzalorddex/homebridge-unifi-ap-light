import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecoveryManager } from '../../src/platform/recoveryManager.js'
import { UnifiAuthError } from '../../src/models/unifiTypes.js'
import { mockLoggerInfoError } from '../fixtures/homebridgeMocks'

describe('RecoveryManager', () => {
	let sessionManager: any
	let refreshDeviceCache: any
	let log: any
	let recoveryManager: RecoveryManager

	beforeEach(() => {
		sessionManager = { authenticate: vi.fn().mockResolvedValue(undefined) }
		refreshDeviceCache = vi.fn().mockResolvedValue(undefined)
		log = mockLoggerInfoError
		recoveryManager = new RecoveryManager(sessionManager, refreshDeviceCache, log)
	})

	it('should call authenticate and refreshDeviceCache and log success', async () => {
		await recoveryManager.forceImmediateCacheRefresh()
		expect(sessionManager.authenticate).toHaveBeenCalled()
		expect(refreshDeviceCache).toHaveBeenCalled()
		expect(log.info).toHaveBeenCalledWith('Immediate cache refresh requested (triggered by accessory error).')
		expect(log.info).toHaveBeenCalledWith('Immediate cache refresh completed successfully.')
	})

	it('should log error if authenticate throws', async () => {
		sessionManager.authenticate.mockRejectedValueOnce(new UnifiAuthError('fail'))
		await recoveryManager.forceImmediateCacheRefresh()
		expect(log.error).toHaveBeenCalledWith('Immediate cache refresh failed:', expect.any(UnifiAuthError))
	})

	it('should log error if refreshDeviceCache throws', async () => {
		refreshDeviceCache.mockRejectedValueOnce(new Error('fail2'))
		await recoveryManager.forceImmediateCacheRefresh()
		expect(log.error).toHaveBeenCalledWith('Immediate cache refresh failed:', expect.any(Error))
	})
})

// No change needed: this test file mocks refreshDeviceCache as a function, which is compatible with DeviceCache.refreshDeviceCache
