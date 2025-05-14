/**
 * DeviceCache
 * Caches UniFi device info for efficient lookup and reduced API calls.
 *
 * Used by the platform to avoid redundant device list fetches and to provide
 * fast lookups for device operations (toggle LED, check status, etc).
 */
import { UnifiDevice } from '../models/unifiTypes.js'

// DeviceCache: Caches device info for efficient lookup and reduced API calls
export class DeviceCache {
	private devices: Map<string, UnifiDevice> = new Map()

	/**
	 * Replace the entire device cache with a new list of devices.
	 *
	 * @param {UnifiDevice[]} devices The latest list of devices from the controller.
	 * @returns {void}
	 */
	setDevices(devices: UnifiDevice[]): void {
		this.devices.clear()
		for (const device of devices) {
			this.devices.set(device._id, device)
		}
	}

	/**
	 * Get a device by its unique ID.
	 *
	 * @param {string} id The device's _id field.
	 * @returns {UnifiDevice|undefined} The device if found, otherwise undefined.
	 */
	getDeviceById(id: string): UnifiDevice | undefined {
		return this.devices.get(id)
	}

	/**
	 * Get all cached devices as an array.
	 *
	 * @returns {UnifiDevice[]}
	 */
	getAllDevices(): UnifiDevice[] {
		return Array.from(this.devices.values())
	}

	/**
	 * Clear the device cache (e.g., on logout or shutdown).
	 *
	 * @returns {void}
	 */
	clear(): void {
		this.devices.clear()
	}
}
