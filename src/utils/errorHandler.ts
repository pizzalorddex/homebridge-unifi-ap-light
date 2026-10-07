import { PlatformAccessory, Logger } from 'homebridge'
import type { UnifiAPLight } from '../platform.js'
import {
	getErrorKey,
	shouldLogError,
	setOffline
} from './errorLogManager.js'

export function markAccessoryNotResponding(platform: UnifiAPLight, accessory: PlatformAccessory): void {
	const service = accessory.getService(platform.Service.Lightbulb)
	if (service) {
		service.updateCharacteristic(
			platform.Characteristic.On,
			new Error('Not Responding')
		)
	} else {
		const ap = accessory.context?.accessPoint
		const name = ap?.name || accessory.displayName || 'Unknown'
		const id = ap?._id || 'unknown'
		platform.log.warn(`[Accessory] Accessory Information Service not found for ${name} (${id})`)
	}
}

export function errorHandler(
	log: Logger,
	error: unknown,
	context?: { site?: string; endpoint?: string }
) {
	const ctxParts = []
	if (context?.site) {
		ctxParts.push(`site: ${context.site}`)
	}
	if (context?.endpoint) {
		ctxParts.push(`endpoint: ${context.endpoint}`)
	}
	const ctx = ctxParts.length ? ctxParts.join(', ') : ''

	let name = 'UnknownError'
	let message = ''
	if (error && typeof error === 'object') {
		const details = error as { name?: unknown; message?: unknown }
		if (typeof details.name === 'string') {
			name = details.name
		}
		if ('message' in details) {
			message = String(details.message)
		} else {
			message = String(error)
		}
	} else {
		message = String(error)
	}
	const errorKey = getErrorKey(name, message, ctx)

	let logLevel: LogLevel = 'error'
	if (name === 'RecoveryInfo') {
		logLevel = 'info'
	}
	const result = name === 'RecoveryInfo'
		? { logLevel: 'info' as LogLevel }
		: shouldLogError(errorKey, message)
	logLevel = result.logLevel
	const summary = result.summary
	// Mark the controller offline only after the repeated-error summary is logged.
	if ((name === 'UnifiNetworkError' || name === 'UnifiAuthError') && summary) {
		setOffline(errorKey)
	}
	if (logLevel === 'none') {
		return
	}

	const noop = () => {}
	let logFn: (msg: string) => void = noop
	if (logLevel === 'error' && typeof log.error === 'function') {
		logFn = log.error.bind(log)
	} else if (logLevel === 'info' && typeof log.info === 'function') {
		logFn = log.info.bind(log)
	} else if (logLevel === 'debug' && typeof log.debug === 'function') {
		logFn = log.debug.bind(log)
	} else if (logLevel === 'warn' && typeof log.warn === 'function') {
		logFn = log.warn.bind(log)
	} else {
		logFn = noop
	}

	if (name === 'RecoveryInfo') {
		if (summary) {
			logFn(`[API] Info${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Info${ctx ? ' [' + ctx + ']' : ''}: ${message}`)
		}
		return
	}
	if (name === 'UnifiApiError') {
		if (summary) {
			logFn(`[API] API error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] API error${ctx ? ' [' + ctx + ']' : ''}: ${message}`)
		}
		return
	}
	if (name === 'UnifiAuthError') {
		if (summary) {
			logFn(`[API] Authentication error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Authentication error${ctx ? ' [' + ctx + ']' : ''}: ${message}`)
		}
		return
	}
	if (name === 'UnifiNetworkError') {
		if (summary) {
			logFn(`[API] Network error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Network error${ctx ? ' [' + ctx + ']' : ''}: ${message}`)
		}
		return
	}
	if (name === 'UnifiConfigError') {
		if (summary) {
			logFn(`[API] Config error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Config error${ctx ? ' [' + ctx + ']' : ''}: ${message}`)
		}
		return
	}

	if (error instanceof Error) {
		if (summary) {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${error.message}`)
		}
	} else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
		if (summary) {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${error.message}`)
		}
	} else {
		if (summary) {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${String(error)}`)
		}
	}
}

export type LogLevel = 'error' | 'warn' | 'debug' | 'info' | 'none'
