export type LogLevel = 'error' | 'warn' | 'debug' | 'info' | 'none'

interface ErrorState {
	lastMessage: string
	lastTimestamp: number
	count: number
	suppressed: number
	offline: boolean
}

export const errorStates: Record<string, ErrorState> = {}

const COOLDOWN_MS = 60000

export function getErrorKey(name: string, message: string, ctx?: string): string {
	return `${name}:${message}:${ctx ?? ''}`
}

export function setOffline(errorKey: string): boolean {
	if (!errorStates[errorKey]) {
		errorStates[errorKey] = {
			lastMessage: '',
			lastTimestamp: 0,
			count: 0,
			suppressed: 0,
			offline: true,
		}
		return false
	} else {
		const wasOffline = errorStates[errorKey].offline
		errorStates[errorKey].offline = true
		return wasOffline
	}
}

export function resetErrorState(): void {
	Object.keys(errorStates).forEach(key => {
		errorStates[key].offline = false
		errorStates[key].count = 0
		errorStates[key].suppressed = 0
	})
}

/** Limits repeated messages to one per minute. */
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
	if (state.offline) {
		return { logLevel: 'debug' }
	}
	if (state.lastMessage !== message) {
		state.lastMessage = message
		state.count = 0
		state.suppressed = 0
		state.lastTimestamp = 0
	}
	if (now - state.lastTimestamp > COOLDOWN_MS) {
		state.lastTimestamp = now
		state.suppressed = 0
		return { logLevel: level }
	}
	if (state.lastTimestamp === 0) {
		state.lastTimestamp = now
		return { logLevel: level }
	}
	state.suppressed++
	return { logLevel: 'none' }
}
