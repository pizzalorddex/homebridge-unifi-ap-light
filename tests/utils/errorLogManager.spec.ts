import { describe, it, expect, beforeEach } from 'vitest'
import {
	shouldLogError,
	setOffline,
	resetErrorState,
	errorStates
} from '../../src/utils/errorLogManager'

describe('errorLogManager', () => {
	beforeEach(() => {
		resetErrorState()
		Date.now = (() => new Date().getTime()) // reset Date.now
	})

	it('logs first error at error level', () => {
		const errorKey = 'TestError:fail:'
		const result = shouldLogError(errorKey, 'fail')
		expect(result.logLevel).toBe('error')
	})

	it('suppresses repeated errors within cooldown', () => {
		const errorKey = 'TestError:fail:'
		shouldLogError(errorKey, 'fail') // 1st call: log
		for (let i = 0; i < 5; i++) {
			const result = shouldLogError(errorKey, 'fail')
			expect(result.logLevel).toBe('none')
		}
	})

	it('resets suppression after cooldown', async () => {
		const errorKey = 'TestError:fail:'
		shouldLogError(errorKey, 'fail') // 1st call: log
		// Simulate time passing
		const state = errorStates[errorKey]
		state.lastTimestamp -= 61000 // > COOLDOWN_MS
		const result = shouldLogError(errorKey, 'fail')
		expect(result.logLevel).toBe('error')
	})

	it('downgrades to debug in offline mode', () => {
		const errorKey = 'TestError:fail:'
		errorStates[errorKey] = {
			lastMessage: 'fail',
			lastTimestamp: Date.now(),
			count: 0,
			suppressed: 0,
			offline: true,
		}
		const result = shouldLogError(errorKey, 'fail')
		expect(result.logLevel).toBe('debug')
	})

	it('resetErrorState clears offline and counters', () => {
		const errorKey = 'TestError:fail:'
		errorStates[errorKey] = {
			lastMessage: 'fail',
			lastTimestamp: Date.now(),
			count: 3,
			suppressed: 2,
			offline: true,
		}
		resetErrorState()
		// Simulate time passing to allow next log
		errorStates[errorKey].lastTimestamp -= 61000
		const result = shouldLogError(errorKey, 'fail')
		expect(result.logLevel).toBe('error')
	})

	it('handles new error message as new state', () => {
		const errorKey = 'TestError:fail:'
		shouldLogError(errorKey, 'fail')
		const newKey = 'TestError:other:'
		const result = shouldLogError(newKey, 'other')
		expect(result.logLevel).toBe('error')
	})
})

describe('setOffline', () => {
	beforeEach(() => {
		resetErrorState()
	})

	it('sets offline when errorKey does not exist', () => {
		const key = 'OfflineTest:fail:'
		const result = setOffline(key)
		expect(result).toBe(false)
		expect(errorStates[key].offline).toBe(true)
	})

	it('returns true if already offline', () => {
		const key = 'OfflineTest:fail:'
		errorStates[key] = {
			lastMessage: 'fail',
			lastTimestamp: 0,
			count: 0,
			suppressed: 0,
			offline: true,
		}
		const result = setOffline(key)
		expect(result).toBe(true)
		// Should remain offline
		expect(errorStates[key].offline).toBe(true)
	})

	it('sets offline and returns false if not already offline', () => {
		const key = 'OfflineTest:fail:'
		errorStates[key] = {
			lastMessage: 'fail',
			lastTimestamp: 0,
			count: 0,
			suppressed: 0,
			offline: false,
		}
		const result = setOffline(key)
		expect(result).toBe(false)
		expect(errorStates[key].offline).toBe(true)
	})
})

describe('shouldLogError edge branches', () => {
	beforeEach(() => {
		resetErrorState()
		Date.now = (() => new Date().getTime())
	})

	it('logs again if message changes (new message branch)', () => {
		const key = 'BranchTest:msg:'
		shouldLogError(key, 'msg1') // logs
		const result = shouldLogError(key, 'msg2') // new message, should log
		expect(result.logLevel).toBe('error')
	})

	it('logs at error level if first time (lastTimestamp is 0)', () => {
		const key = 'BranchTest:first:'
		resetErrorState()
		const result = shouldLogError(key, 'first')
		expect(result.logLevel).toBe('error')
	})
})
