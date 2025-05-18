// Centralized error handling utilities
import { PlatformAccessory } from 'homebridge'
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
