// Centralized error handling utilities
import { PlatformAccessory, Logger } from 'homebridge'
import type { UnifiAPLight } from '../platform.js'
import {
	getErrorKey,
	shouldLogError,
	setOffline
} from './errorLogManager.js'

/**
 * Mark a HomeKit accessory as Not Responding (instance method logic).
 */
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

/**
 * Mark this UniFiAP instance as Not Responding (for use in UniFiAP class).
 */
export function markThisAccessoryNotResponding(instance: { service: any, platform: UnifiAPLight, accessPoint: any }): void {
	if (instance.service) {
		instance.service.updateCharacteristic(
			instance.platform.Characteristic.On,
			new Error('Not Responding')
		)
	} else {
		instance.platform.log.warn(`[Accessory] Accessory Information Service not found for ${instance.accessPoint.name} (${instance.accessPoint._id})`)
	}
}

/**
 * Centralized error handler for all custom UniFi errors and generic errors.
 * This should be the only place in the codebase that logs or handles errors.
 *
 * Usage: errorHandler(log, error, { site, endpoint })
 */
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
	if (error && typeof error === 'object' && 'name' in error) {
		name = (error as any).name
	}
	if (error && typeof error === 'object' && 'message' in error) {
		message = String((error as any).message)
	} else {
		message = String(error)
	}
	const errorKey = getErrorKey(name, message, ctx)

	let logLevel: 'error' | 'warn' | 'debug' | 'none' = 'error'
	// Apply suppression/throttling for all errors
	const result = shouldLogError(errorKey, message)
	logLevel = result.logLevel
	const summary = result.summary
	// Only set offline for network/auth errors after summary is logged (i.e., after 7th call)
	if ((name === 'UnifiNetworkError' || name === 'UnifiAuthError') && summary) {
		setOffline(errorKey)
	}
	if (logLevel === 'none') {
		return
	}

	// Always ensure logFn is a function
	const noop = () => {}
	let logFn: (msg: string) => void = noop
	if (logLevel === 'error' && typeof log.error === 'function') {
		logFn = log.error.bind(log)
	} else if (logLevel === 'debug' && typeof log.debug === 'function') {
		logFn = log.debug.bind(log)
	} else if (logLevel === 'warn' && typeof log.warn === 'function') {
		logFn = log.warn.bind(log)
	} else {
		logFn = noop
	}

	// Handle custom UniFi errors
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

	// Fallback for generic errors
	if (error instanceof Error) {
		if (summary) {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${error.message}`)
		}
	} else if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
		if (summary) {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${(error as any).message}`)
		}
	} else {
		if (summary) {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${summary}`)
		} else {
			logFn(`[API] Error${ctx ? ' [' + ctx + ']' : ''}: ${String(error)}`)
		}
	}
}
