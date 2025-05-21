// Moved from src/accessoryFactory.ts
import { UniFiAP } from './platformAccessory.js'
import type { UnifiAPLight } from '../platform.js'
import type { PlatformAccessory } from 'homebridge'
import type { UnifiDevice } from '../models/unifiTypes.js'
import { PLATFORM_NAME, PLUGIN_NAME } from '../settings.js'

/**
 * Factory for creating and managing UniFiAP accessories.
 *
 * This module encapsulates all HomeKit accessory lifecycle logic for the UniFi AP Light platform.
 * It provides helpers for creating, restoring, removing, and marking accessories as not responding.
 */

/**
 * Creates and registers a new UniFiAP accessory with Homebridge.
 *
 * @param platform - The Homebridge platform instance
 * @param accessPoint - The UniFi device to register
 * @param uuid - The unique identifier for the accessory
 * @returns The created PlatformAccessory
 */
export function createAndRegisterAccessory(platform: UnifiAPLight, accessPoint: UnifiDevice, uuid: string): PlatformAccessory {
	const accessory = new platform.api.platformAccessory(accessPoint.name, uuid)
	accessory.context.accessPoint = accessPoint
	platform.accessories.push(accessory)
	platform.log.info(`[Accessory] Added new accessory: ${accessPoint.name} (${accessPoint._id})`)
	new UniFiAP(platform, accessory)
	try {
		platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
	} catch (err) {
		platform.log.error(`[Accessory] Error during registerPlatformAccessories for ${accessPoint.name} (${accessPoint._id}): ${(err as Error).message}`)
	}
	return accessory
}

/**
 * Restores an existing UniFiAP accessory from cache.
 *
 * @param platform - The Homebridge platform instance
 * @param accessPoint - The UniFi device to restore
 * @param existingAccessory - The cached PlatformAccessory
 */
export function restoreAccessory(platform: UnifiAPLight, accessPoint: UnifiDevice, existingAccessory: PlatformAccessory): void {
	platform.log.info(`[Discovery] Matched device to cached accessory: ${existingAccessory.displayName} (${accessPoint._id})`)
	new UniFiAP(platform, existingAccessory)
}

/**
 * Removes a UniFiAP accessory from Homebridge and the platform cache.
 *
 * @param platform - The Homebridge platform instance
 * @param accessory - The PlatformAccessory to remove
 */
export function removeAccessory(platform: UnifiAPLight, accessory: PlatformAccessory): void {
	const ap = accessory.context.accessPoint
	platform.log.info(`[Exclusion] Removing accessory from cache: ${accessory.displayName} (${ap?._id})`)
	try {
		platform.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
	} catch (err) {
		platform.log.error(`[Exclusion] Error during unregisterPlatformAccessories for ${accessory.displayName} (${ap?._id}): ${(err as Error).message}`)
	}
	const idx = platform.accessories.findIndex(acc => acc.UUID === accessory.UUID)
	if (idx !== -1) {
		platform.accessories.splice(idx, 1)
	}
}
