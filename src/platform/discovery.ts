// Handles device discovery logic for the platform
import type { UnifiAPLight } from '../platform.js'
import { UnifiAuthError, UnifiApiError, UnifiNetworkError } from '../models/unifiTypes.js'
import { getAccessPoints } from '../unifi.js'
import { markAccessoryNotResponding } from '../utils/errorHandler.js'
import { restoreAccessory, removeAccessory, createAndRegisterAccessory } from '../accessory/accessoryFactory.js'
import { filterRelevantAps } from '../utils/apFilter.js'

/**
 * Discovers UniFi devices and manages Homebridge accessories accordingly.
 *
 * - Authenticates with the UniFi controller.
 * - Resolves configured sites to internal site names.
 * - Fetches access points from the UniFi API.
 * - Updates the device cache and Homebridge accessories (add, restore, or remove).
 * - Handles all error cases, marking accessories as Not Responding and clearing cache if needed.
 *
 * @param platform The Homebridge platform instance
 * @returns Promise<void>
 */
export async function discoverDevices(platform: UnifiAPLight): Promise<void> {
	try {
		// Authenticate with the UniFi controller before discovery
		await platform.sessionManager.authenticate()
	} catch (err: unknown) {
		// Handle authentication errors and mark all accessories as Not Responding
		if (err instanceof UnifiAuthError) {
			platform.log.error(`Authentication failed during device discovery: ${err.message}`)
		} else {
			platform.log.error(`Unexpected error during authentication: ${err instanceof Error ? err.message : String(err)}`)
		}
		for (const accessory of platform.accessories) {
			markAccessoryNotResponding(platform, accessory)
		}
		platform.getDeviceCache().clear()
		return
	}

	try {
		// Determine which sites to use for discovery
		const siteInput = platform.config.sites?.length ? platform.config.sites : ['default']
		const resolvedSites: string[] = []
		for (const site of siteInput) {
			const internal = platform.sessionManager.getSiteName(site)
			if (internal) {
				resolvedSites.push(internal)
			} else {
				platform.log.warn(`Site "${site}" is not recognized by the UniFi controller.`)
			}
		}
		if (!resolvedSites.length) {
			platform.log.error('No valid sites resolved. Aborting discovery.')
			return
		}

		// Fetch access points from the UniFi API
		const accessPoints = await getAccessPoints(
			platform.sessionManager.request.bind(platform.sessionManager),
			platform.sessionManager.getApiHelper(),
			resolvedSites,
			platform.log
		)

		// Filter APs by include/exclude config
		const includeIds = platform.config.includeIds
		const excludeIds = platform.config.excludeIds
		const relevantAps = filterRelevantAps(accessPoints, includeIds, excludeIds)

		// Update the device cache
		platform.getDeviceCache().setDevices(relevantAps)
		if (!relevantAps.length) {
			platform.log.warn('No relevant access points discovered. Check your site configuration, include/exclude settings, and permissions.')
		}

		// Register, restore, or remove Homebridge accessories based on discovered devices
		for (const accessPoint of relevantAps) {
			const uuid = platform.api.hap.uuid.generate(accessPoint._id)
			const isIncluded = includeIds?.length ? includeIds.includes(accessPoint._id) : true
			const isExcluded = excludeIds?.includes(accessPoint._id) || false
			const existingAccessory = platform.accessories.find(acc => acc.UUID === uuid)
			if (existingAccessory) {
				if (isIncluded && !isExcluded) {
					restoreAccessory(platform, accessPoint, existingAccessory)
				} else if (isExcluded) {
					removeAccessory(platform, existingAccessory)
				}
			} else if (isIncluded && !isExcluded) {
				createAndRegisterAccessory(platform, accessPoint, uuid)
			}
		}
	} catch (err: unknown) {
		// Handle API/network errors and mark all accessories as Not Responding
		if (err instanceof UnifiApiError || err instanceof UnifiNetworkError) {
			platform.log.error(`Device discovery failed: ${err.message}`)
			for (const accessory of platform.accessories) {
				markAccessoryNotResponding(platform, accessory)
			}
			platform.getDeviceCache().clear()
		} else {
			const axiosError = err as any
			platform.log.error(`Device discovery failed: ${axiosError.message ?? err}`)
			for (const accessory of platform.accessories) {
				markAccessoryNotResponding(platform, accessory)
			}
			platform.getDeviceCache().clear()
		}
	}
}
