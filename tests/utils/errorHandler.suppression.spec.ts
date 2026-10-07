import { describe, it, expect, vi, beforeEach } from 'vitest'
import { errorHandler } from '../../src/utils/errorHandler.js'

vi.unmock('../../src/utils/errorLogManager')

describe('errorHandler log suppression and offline mode (real errorLogManager)', () => {
	let log: any
	let resetErrorState: () => void
	let getErrorKey: (name: string, message: string) => string
	let errorStates: Record<string, { lastTimestamp: number }>

	beforeEach(async () => {
		const realErrorLogManager = await import('../../src/utils/errorLogManager.js')
		resetErrorState = realErrorLogManager.resetErrorState
		getErrorKey = realErrorLogManager.getErrorKey
		errorStates = realErrorLogManager.errorStates
		log = {
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
		}
		resetErrorState()
	})

	it('suppresses repeated errors after first log (no summary)', () => {
		resetErrorState()
		errorHandler(log, { name: 'UnifiNetworkError', message: 'net fail unique' })
		for (let i = 0; i < 6; i++) {
			errorHandler(log, { name: 'UnifiNetworkError', message: 'net fail unique' })
		}
		expect(log.error).toHaveBeenCalledTimes(1)
	})

	it('logs again after resetErrorState', () => {
		const err = { name: 'UnifiNetworkError', message: 'net fail again' }
		resetErrorState()
		errorHandler(log, err)
		for (let i = 0; i < 3; i++) {
			errorHandler(log, err)
		}
		const errorKey = getErrorKey('UnifiNetworkError', 'net fail again')
		if (errorStates[errorKey]) {
			errorStates[errorKey].lastTimestamp -= 61000
		}
		resetErrorState()
		errorHandler(log, err)
		expect(log.error).toHaveBeenCalledTimes(2)
	})

	it('suppresses repeated info logs after first log (recovery info suppression)', async () => {
		resetErrorState()
		const infoMsg = 'Immediate cache refresh requested (triggered by accessory error).'
		const ctx = 'endpoint: forceImmediateCacheRefresh'
		const { getErrorKey, shouldLogError } = await import('../../src/utils/errorLogManager.js')
		const infoKey = getErrorKey('RecoveryInfo', infoMsg, ctx)
		let result = shouldLogError(infoKey, infoMsg, 'info')
		expect(result.logLevel).toBe('info')
		for (let i = 0; i < 5; i++) {
			result = shouldLogError(infoKey, infoMsg, 'info')
			expect(result.logLevel).toBe('none')
		}
	})

	it('logs info again after cooldown (recovery info suppression)', async () => {
		resetErrorState()
		const { errorStates } = await import('../../src/utils/errorLogManager.js')
		Object.keys(errorStates).forEach(k => delete errorStates[k])
		const infoMsg = 'Immediate cache refresh requested (triggered by accessory error).'
		const ctx = 'endpoint: forceImmediateCacheRefresh'
		const { getErrorKey, shouldLogError } = await import('../../src/utils/errorLogManager.js')
		const infoKey = getErrorKey('RecoveryInfo', infoMsg, ctx)

		const baseTime = 1000000
		let now = baseTime
		const realDateNow = Date.now
		Date.now = () => now

		let result = shouldLogError(infoKey, infoMsg, 'info')
		expect(result.logLevel).toBe('info')
		for (let i = 0; i < 3; i++) {
			result = shouldLogError(infoKey, infoMsg, 'info')
			expect(result.logLevel).toBe('none')
		}
		now += 61000
		result = shouldLogError(infoKey, infoMsg, 'info')
		Date.now = realDateNow
		expect(result.logLevel).toBe('info')
	})
})
