import { describe, it, expect, beforeEach } from 'vitest'
import {
	getErrorKey,
	shouldLogError,
	setOffline,
	resetErrorState
} from '../../src/utils/errorLogManager'

const errorName = 'UnifiNetworkError'
const errorMsg = 'net fail'
const ctx = 'site: default, endpoint: /api'
const errorKey = getErrorKey(errorName, errorMsg, ctx)

// Helper to advance time
function advanceTime(ms: number) {
	const now = Date.now()
	Date.now = () => now + ms
}

describe('errorLogManager', () => {
	beforeEach(() => {
		resetErrorState()
		Date.now = (() => new Date().getTime()) // reset Date.now
	})

	it('logs first error at error level', () => {
		const result = shouldLogError(errorKey, errorMsg)
		expect(result.logLevel).toBe('error')
	})

	it('suppresses repeated errors within cooldown', () => {
		shouldLogError(errorKey, errorMsg)
		const result2 = shouldLogError(errorKey, errorMsg)
		expect(result2.logLevel).toBe('none')
	})

	it('logs summary at threshold', () => {
		shouldLogError(errorKey, errorMsg)
		for (let i = 0; i < 5; i++) {
			shouldLogError(errorKey, errorMsg)
		}
		const result = shouldLogError(errorKey, errorMsg) // 7th call, should log summary
		expect(result.logLevel).toBe('error')
		expect(result.summary).toMatch(/Suppressed/)
	})

	it('resets suppression after cooldown', () => {
		shouldLogError(errorKey, errorMsg)
		for (let i = 0; i < 3; i++) 
			shouldLogError(errorKey, errorMsg)
		advanceTime(61000)
		const result = shouldLogError(errorKey, errorMsg)
		expect(result.logLevel).toBe('error')
	})

	it('downgrades to debug in offline mode', () => {
		setOffline(errorKey)
		const result = shouldLogError(errorKey, errorMsg)
		expect(result.logLevel).toBe('debug')
	})

	it('resetErrorState clears offline and counters', () => {
		setOffline(errorKey)
		shouldLogError(errorKey, errorMsg)
		resetErrorState()
		const result = shouldLogError(errorKey, errorMsg)
		expect(result.logLevel).toBe('error')
	})

	it('handles new error message as new state', () => {
		shouldLogError(errorKey, errorMsg)
		const newMsg = 'net fail 2'
		const newKey = getErrorKey(errorName, newMsg, ctx)
		const result = shouldLogError(newKey, newMsg)
		expect(result.logLevel).toBe('error')
	})
})
