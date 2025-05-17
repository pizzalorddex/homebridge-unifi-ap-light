import { UniFiAP } from './platformAccessory.js';
import type { UnifiAPLight } from './platform.js';
import type { PlatformAccessory } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

/**
 * Factory for creating and managing UniFiAP accessories.
 *
 * This module encapsulates all HomeKit accessory lifecycle logic for the UniFi AP Light platform.
 * It provides helpers for creating, restoring, removing, and marking accessories as not responding.
 */

/**
 * Creates and registers a new UniFiAP accessory with Homebridge and the platform.
 *
 * @param platform - The Homebridge platform instance
 * @param accessPoint - The UniFi device object
 * @param uuid - The HomeKit UUID for the accessory
 * @returns The created and registered PlatformAccessory
 */
export function createAndRegisterAccessory(platform: UnifiAPLight, accessPoint: any, uuid: string): PlatformAccessory {
  // Create a new Homebridge accessory instance
  const accessory = new platform.api.platformAccessory(accessPoint.name, uuid);
  // Store the UniFi device in the accessory context for later reference
  accessory.context.accessPoint = accessPoint;
  // Add the accessory to the platform's internal array
  platform.accessories.push(accessory);
  platform.log.info(`Adding new accessory: ${accessPoint.name} (${accessPoint._id})`);
  // Initialize the HomeKit service and characteristics
  new UniFiAP(platform, accessory);
  try {
    // Register the accessory with Homebridge
    platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  } catch (err) {
    platform.log.error('Error during registerPlatformAccessories: ' + (err as Error).message);
  }
  return accessory;
}

/**
 * Restores an existing accessory from the Homebridge cache and re-initializes its logic.
 *
 * @param platform - The Homebridge platform instance
 * @param accessPoint - The UniFi device object
 * @param existingAccessory - The cached PlatformAccessory to restore
 */
export function restoreAccessory(platform: UnifiAPLight, accessPoint: any, existingAccessory: PlatformAccessory): void {
  platform.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} (${accessPoint._id})`);
  // Re-initialize the accessory logic (restores event handlers, etc.)
  new UniFiAP(platform, existingAccessory);
}

/**
 * Removes an accessory from Homebridge and the platform's internal array.
 *
 * @param platform - The Homebridge platform instance
 * @param accessory - The PlatformAccessory to remove
 */
export function removeAccessory(platform: UnifiAPLight, accessory: PlatformAccessory): void {
  platform.log.info(`Removing accessory from cache due to exclusion settings: ${accessory.displayName} (${accessory.context.accessPoint?._id})`);
  try {
    // Unregister the accessory from Homebridge
    platform.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  } catch (err) {
    platform.log.error('Error during unregisterPlatformAccessories: ' + (err as Error).message);
  }
  // Remove the accessory from the platform's internal array
  const idx = platform.accessories.findIndex(acc => acc.UUID === accessory.UUID);
  if (idx !== -1) {
    platform.accessories.splice(idx, 1);
  }
}

/**
 * Marks a HomeKit accessory as "Not Responding" in the Home app.
 *
 * @param platform - The Homebridge platform instance
 * @param accessory - The PlatformAccessory to mark as not responding
 */
export function markAccessoryNotResponding(platform: UnifiAPLight, accessory: PlatformAccessory): void {
  // Attempt to get the Lightbulb service and update its On characteristic with an error
  const service = accessory.getService(platform.Service.Lightbulb);
  if (service) {
    service.updateCharacteristic(
      platform.Characteristic.On,
      new Error('Not Responding')
    );
  }
}
