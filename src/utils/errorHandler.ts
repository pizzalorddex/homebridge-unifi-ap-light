// Centralized error handling utilities
import { PlatformAccessory, Logger } from 'homebridge'
import type { UnifiAPLight } from '../platform.js'

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
		const site = ap?.site || 'unknown'
		platform.log.warn(`Accessory Information Service not found for ${name} (${id}, site: ${site})`)
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
		instance.platform.log.warn(`Accessory Information Service not found for ${instance.accessPoint.name} (${instance.accessPoint._id}, site: ${instance.accessPoint.site})`)
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
	const ctx = [
		context?.site ? `site: ${context.site}` : '',
		context?.endpoint ? `endpoint: ${context.endpoint}` : ''
	].filter(Boolean).join(' ')

	// Handle custom UniFi errors
	if (error && typeof error === 'object') {
		const name = (error as any).name
		const message = (error as any).message || String(error)
		if (name === 'UnifiApiError') {
			log.error(`API error${ctx ? ' [' + ctx + ']' : ''}: ${message}`)
			return
		}
		if (name === 'UnifiAuthError') {
			log.error(`Authentication error${ctx ? ' [' + ctx + ']' : ''}: ${message}`)
			return
		}
		if (name === 'UnifiNetworkError') {
			log.error(`Network error${ctx ? ' [' + ctx + ']' : ''}: ${message}`)
			return
		}
		if (name === 'UnifiConfigError') {
			log.error(`Config error${ctx ? ' [' + ctx + ']' : ''}: ${message}`)
			return
		}
	}

	// Fallback for generic errors
	if (error instanceof Error) {
		log.error(`Error${ctx ? ' [' + ctx + ']' : ''}: ${error.message}`)
	} else if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
		log.error(`Error${ctx ? ' [' + ctx + ']' : ''}: ${(error as any).message}`)
	} else {
		log.error(`Error${ctx ? ' [' + ctx + ']' : ''}: ${String(error)}`)
	}
}
