/**
 * errorLogManager.ts
 * Utility for error log suppression, throttling, and offline/online state management.
 * Ensures repeated errors are not spammed to the log, and escalates/downgrades log level as needed.
 */

export type LogLevel = 'error' | 'warn' | 'debug' | 'none'

interface ErrorState {
	lastMessage: string
	lastTimestamp: number
	count: number
	suppressed: number
	offline: boolean
}

export const errorStates: Record<string, ErrorState> = {}
const COOLDOWN_MS = 30000 // 30 seconds

/**
 * Generate a unique key for an error based on type, message, and context.
 */
export function getErrorKey(name: string, message: string, ctx?: string): string {
	return `${name}:${message}:${ctx ?? ''}`
}

/**
 * Should be called when a network/auth error is detected.
 * Puts the system in offline mode (all errors downgraded to debug).
 */
export function setOffline(errorKey: string): boolean {
	if (!errorStates[errorKey]) {
		errorStates[errorKey] = {
			lastMessage: '',
			lastTimestamp: 0,
			count: 0,
			suppressed: 0,
			offline: true,
		}
		return false // just set offline
	} else {
		const wasOffline = errorStates[errorKey].offline
		errorStates[errorKey].offline = true
		return wasOffline // true if already offline, false if just set
	}
}

/**
 * Should be called when a successful connection is restored.
 * Resets offline state and counters for all errors.
 */
export function resetErrorState(): void {
	Object.keys(errorStates).forEach(key => {
		errorStates[key].offline = false
		errorStates[key].count = 0
		errorStates[key].suppressed = 0
	})
}

/**
 * Determines if an error should be logged, at what level, and if a summary should be shown.
 * Returns logLevel and optional summary string.
 */
export function shouldLogError(errorKey: string, message: string): { logLevel: LogLevel, summary?: string } {
	const now = Date.now()
	let state = errorStates[errorKey]
	if (!state) {
		state = errorStates[errorKey] = {
			lastMessage: message,
			lastTimestamp: now,
			count: 0,
			suppressed: 0,
			offline: false,
		}
	}
	// If offline, always downgrade to debug
	if (state.offline) {
		return { logLevel: 'debug' }
	}
	// If new message, reset state
	if (state.lastMessage !== message) {
		state.lastMessage = message
		state.count = 0
		state.suppressed = 0
	}
	state.count++
	// 1st call: log error
	if (state.count === 1 || now - state.lastTimestamp > COOLDOWN_MS) {
		state.lastTimestamp = now
		state.suppressed = 0
		return { logLevel: 'error' }
	}
	// 7th: log summary
	if (state.count === 7) {
		return {
			logLevel: 'error',
			summary: `Suppressed 6 repeated errors in the last ${COOLDOWN_MS / 1000} seconds.`
		}
	}
	// 2nd–6th: suppress
	if (state.count > 1 && state.count < 7) {
		return { logLevel: 'none' }
	}
	// 8th+: suppress
	return { logLevel: 'none' } as const
}
