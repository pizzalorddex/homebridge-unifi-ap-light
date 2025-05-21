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

	/**
	 * Refresh the device cache from the UniFi controller.
	 *
	 * @param platform - The Homebridge platform instance (for config, session, logging, and accessories)
	 * @returns Promise<void>
	 */
	static async refreshDeviceCache(platform: any): Promise<void> {
		try {
			const siteInput = platform.config.sites?.length ? platform.config.sites : ['default']
			const resolvedSites: string[] = []
			for (const site of siteInput) {
				const internal = platform.sessionManager.getSiteName(site)
				if (internal) {
					resolvedSites.push(internal)
				}
			}
			if (!resolvedSites.length) {
				platform.log.error('[Cache Refresh] No valid sites resolved. Aborting device cache refresh.')
				return
			}
			let accessPoints = []
			try {
				const { getAccessPoints } = await import('../unifi.js')
				accessPoints = await getAccessPoints(
					platform.sessionManager.request.bind(platform.sessionManager),
					platform.sessionManager.getApiHelper(),
					resolvedSites,
					platform.log
				)
			} catch (err) {
				platform.log.warn(`[Cache Refresh] Device cache refresh failed, attempting re-authentication... Error: ${err instanceof Error ? err.message : String(err)}`)
				await platform.sessionManager.authenticate()
				const { getAccessPoints } = await import('../unifi.js')
				accessPoints = await getAccessPoints(
					platform.sessionManager.request.bind(platform.sessionManager),
					platform.sessionManager.getApiHelper(),
					resolvedSites,
					platform.log
				)
			}
			platform.getDeviceCache().setDevices(accessPoints)
			platform.log.info(`[Cache Refresh] Device cache refreshed. ${accessPoints.length} devices currently available.`)
		} catch (err) {
			const { UnifiAuthError, UnifiApiError, UnifiNetworkError } = await import('../models/unifiTypes.js')
			if (err instanceof UnifiAuthError) {
				platform.log.error('[Cache Refresh] Device cache refresh failed: Failed to detect UniFi API structure during authentication')
			} else if (err instanceof UnifiApiError || err instanceof UnifiNetworkError) {
				platform.log.error(`[Cache Refresh] Device cache refresh failed: ${err.message}`)
			} else if (err instanceof Error) {
				platform.log.error(`[Cache Refresh] Device cache refresh failed: ${err.message}`)
			} else if (typeof err === 'string') {
				platform.log.error('[Cache Refresh] Device cache refresh failed:', err)
			} else {
				platform.log.error('[Cache Refresh] Device cache refresh failed:', err)
			}
			const { markAccessoryNotResponding } = await import('../utils/errorHandler.js')
			for (const accessory of platform.accessories) {
				markAccessoryNotResponding(platform, accessory)
			}
			platform.getDeviceCache().clear()
		}
	}
}
