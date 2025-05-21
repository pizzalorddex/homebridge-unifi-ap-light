import { describe, it, expect, vi, beforeEach } from 'vitest'
import { errorHandler } from '../../src/utils/errorHandler.js'

describe('errorHandler log suppression and offline mode (real errorLogManager)', () => {
	let log: any
	let resetErrorState: () => void
	let getErrorKey: (name: string, message: string) => string
	let errorStates: Record<string, { lastTimestamp: number }>

	beforeEach(async () => {
		vi.unmock('../../src/utils/errorLogManager')
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
		// Use a unique error key for this test to avoid suppression from other tests
		errorHandler(log, { name: 'UnifiNetworkError', message: 'net fail unique' })
		for (let i = 0; i < 6; i++) {
			errorHandler(log, { name: 'UnifiNetworkError', message: 'net fail unique' })
		}
		// Only the first should be error, others suppressed
		expect(log.error).toHaveBeenCalledTimes(1)
	})

	it('logs again after resetErrorState', () => {
		const err = { name: 'UnifiNetworkError', message: 'net fail again' }
		resetErrorState()
		errorHandler(log, err)
		for (let i = 0; i < 3; i++) {
			errorHandler(log, err)
		}
		// Simulate time passing to allow next log after reset
		const errorKey = getErrorKey('UnifiNetworkError', 'net fail again')
		if (errorStates[errorKey]) {
			errorStates[errorKey].lastTimestamp -= 61000
		}
		resetErrorState()
		errorHandler(log, err)
		// After reset and cooldown, should log error again
		expect(log.error).toHaveBeenCalledTimes(2)
	})
})
