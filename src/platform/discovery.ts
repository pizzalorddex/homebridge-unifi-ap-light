import type { UnifiAPLight } from '../platform.js'
import { getAccessPoints } from '../unifi.js'
import { errorHandler, markAccessoryNotResponding } from '../utils/errorHandler.js'
import { restoreAccessory, removeAccessory, createAndRegisterAccessory } from '../accessory/accessoryFactory.js'
import { filterRelevantAps } from '../utils/apFilter.js'

/** Syncs the configured UniFi access points with Homebridge. */
export async function discoverDevices(platform: UnifiAPLight, authenticate = true): Promise<void> {
	try {
		if (authenticate) {
			await platform.sessionManager.authenticate()
		}
	} catch (err: unknown) {
		errorHandler(platform.log, err, { endpoint: 'authentication (device discovery)' })
		for (const accessory of platform.accessories) {
			markAccessoryNotResponding(platform, accessory)
		}
		platform.getDeviceCache().clear()
		return
	}

	try {
		if (!authenticate && !(platform.config.sites?.length ? platform.config.sites : ['default']).some(site => platform.sessionManager.getSiteName(site))) {
			await platform.sessionManager.authenticate()
		}
		const siteInput = platform.config.sites?.length ? platform.config.sites : ['default']
		let resolvedSites: string[] = []
		for (const site of siteInput) {
			const internal = platform.sessionManager.getSiteName(site)
			if (internal) {
				resolvedSites.push(internal)
			} else {
				platform.log.warn(`[Discovery] Site "${site}" is not recognized by the UniFi controller.`)
			}
		}
		if (!resolvedSites.length) {
			platform.log.error('[Discovery] No valid sites resolved. Aborting discovery.')
			return
		}

		const fetchDevices = () => getAccessPoints(
			platform.sessionManager.request.bind(platform.sessionManager),
			platform.sessionManager.getApiHelper(),
			resolvedSites,
			platform.log
		)

		let accessPoints
		try {
			accessPoints = await fetchDevices()
		} catch (err) {
			if (authenticate) {
				throw err
			}
			await platform.sessionManager.authenticate()
			resolvedSites = siteInput.map(site => platform.sessionManager.getSiteName(site)).filter((site): site is string => Boolean(site))
			if (!resolvedSites.length) {
				throw new Error('No valid sites resolved after authentication')
			}
			accessPoints = await fetchDevices()
		}
		if (platform.isShuttingDown) {
			return
		}

		const includeIds = platform.config.includeIds
		const excludeIds = platform.config.excludeIds
		const relevantAps = filterRelevantAps(accessPoints, includeIds, excludeIds)

		platform.getDeviceCache().setDevices(relevantAps)
		if (!relevantAps.length) {
			platform.log.warn('[Discovery] No relevant access points discovered. Check your site configuration, include/exclude settings, and permissions.')
		}

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

		// Remove cached accessories hidden by the current filters.
		if (excludeIds && excludeIds.length > 0) {
			for (const accessory of platform.accessories.slice()) {
				const id = accessory.context?.accessPoint?._id
				if (id && excludeIds.includes(id)) {
					removeAccessory(platform, accessory)
				}
			}
		}
		if (includeIds && includeIds.length > 0) {
			for (const accessory of platform.accessories.slice()) {
				const id = accessory.context?.accessPoint?._id
				if (id && !includeIds.includes(id)) {
					removeAccessory(platform, accessory)
				}
			}
		}
	} catch (err: unknown) {
		errorHandler(platform.log, err, { endpoint: 'device discovery' })
		for (const accessory of platform.accessories) {
			markAccessoryNotResponding(platform, accessory)
		}
		platform.getDeviceCache().clear()
	}
}
