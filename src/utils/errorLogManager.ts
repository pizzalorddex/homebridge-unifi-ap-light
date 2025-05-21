/**
 * errorLogManager.ts
 * Utility for error log suppression, throttling, and offline/online state management.
 * Ensures repeated errors are not spammed to the log, and escalates/downgrades log level as needed.
 */

export type LogLevel = 'error' | 'warn' | 'debug' | 'info' | 'none'

/**
 * Tracks the state of each unique error or log message for suppression/throttling.
 */
interface ErrorState {
	lastMessage: string
	lastTimestamp: number
	count: number
	suppressed: number
	offline: boolean
}

/**
 * Global state for all error/log suppression.
 */
export const errorStates: Record<string, ErrorState> = {}

/**
 * Cooldown period (in ms) for suppressing repeated logs.
 * After this period, the next log will be shown, then suppressed again.
 */
const COOLDOWN_MS = 60000 // 1 minute

/**
 * Generate a unique key for an error or log message based on type, message, and context.
 * @param name The error or log type/name
 * @param message The error or log message
 * @param ctx Optional context string (e.g., endpoint, site)
 * @returns A unique string key for this error/log
 */
export function getErrorKey(name: string, message: string, ctx?: string): string {
	return `${name}:${message}:${ctx ?? ''}`
}

/**
 * Should be called when a network/auth error is detected.
 * Puts the system in offline mode (all errors downgraded to debug).
 * @param errorKey The unique error key
 * @returns True if already offline, false if just set
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
 * Resets offline state and counters for all errors/logs.
 */
export function resetErrorState(): void {
	Object.keys(errorStates).forEach(key => {
		errorStates[key].offline = false
		errorStates[key].count = 0
		errorStates[key].suppressed = 0
	})
}

/**
 * Determines if a log (error/info/etc) should be shown, at what level, and if a summary should be shown.
 * Returns logLevel and optional summary string.
 *
 * New logic: Log the first message, suppress all repeats for COOLDOWN_MS, then allow the next, etc.
 *
 * @param errorKey Unique key for the log message
 * @param message The log message
 * @param level The log level to use when not suppressed (default: 'error')
 * @returns An object with logLevel (and optional summary)
 */
export function shouldLogError(
	errorKey: string,
	message: string,
	level: LogLevel = 'error'
): { logLevel: LogLevel, summary?: string } {
	const now = Date.now()
	let state = errorStates[errorKey]
	if (!state) {
		state = errorStates[errorKey] = {
			lastMessage: message,
			lastTimestamp: 0,
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
		state.lastTimestamp = 0
	}
	// If enough time has passed, log again
	if (now - state.lastTimestamp > COOLDOWN_MS) {
		state.lastTimestamp = now
		state.suppressed = 0
		return { logLevel: level }
	}
	// If first time (lastTimestamp is 0), log
	if (state.lastTimestamp === 0) {
		state.lastTimestamp = now
		return { logLevel: level }
	}
	// Otherwise, suppress
	state.suppressed++
	return { logLevel: 'none' }
}
