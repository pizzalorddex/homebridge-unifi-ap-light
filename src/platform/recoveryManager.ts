import { Logger } from 'homebridge'
import { SessionManager } from '../utils/sessionManager.js'
import { UnifiApiHelper } from '../api/unifiApiHelper.js'
import { getAccessPoints } from '../unifi.js'
import { filterRelevantAps } from '../utils/apFilter.js'

/**
 * Handles platform recovery actions such as immediate re-authentication and device cache refresh.
 * Now includes robust device readiness check before updating cache/accessories.
 */
export class RecoveryManager {
	constructor(
    private readonly sessionManager: SessionManager,
    private readonly refreshDeviceCache: () => Promise<void>,
    private readonly log: Logger
	) {}

	/**
   * Immediately re-authenticates and refreshes the device cache.
   * Only updates cache/accessories if devices are truly ready (controller and devices online).
   *
   * @returns {Promise<void>}
   */
	public async forceImmediateCacheRefresh(): Promise<void> {
		this.log.info('Immediate cache refresh requested (triggered by accessory error).')
		try {
			await this.sessionManager.authenticate()

			// Fetch all access points for all sites
			const platform: any = (this as any).platform || undefined
			const configSites = platform?.config?.sites?.length ? platform.config.sites : ['default']
			const resolvedSites: string[] = []
			for (const site of configSites) {
				const internal = this.sessionManager.getSiteName(site)
				if (internal) {
					resolvedSites.push(internal)
				}
			}
			if (!resolvedSites.length) {
				this.log.error('No valid sites resolved. Aborting recovery cache refresh.')
				return
			}
			const apiHelper = this.sessionManager.getApiHelper()
			const allDevices = await getAccessPoints(
				this.sessionManager.request.bind(this.sessionManager),
				apiHelper,
				resolvedSites,
				this.log
			)

			// Filter APs by include/exclude config before readiness check
			const includeIds = platform?.config?.includeIds
			const excludeIds = platform?.config?.excludeIds
			const relevantAps = filterRelevantAps(allDevices, includeIds, excludeIds)

			// Only keep devices that are truly ready
			const readyDevices = relevantAps.filter(UnifiApiHelper.isDeviceReady)
			if (!readyDevices.length) {
				this.log.warn('No relevant UniFi APs are ready after controller recovery. Will not update cache or accessories.')
				return
			}
			// Update the device cache with only ready devices
			if (platform && typeof platform.getDeviceCache === 'function') {
				platform.getDeviceCache().setDevices(readyDevices)
				this.log.info(`Device cache refreshed after recovery. ${readyDevices.length} devices are ready and available.`)
			} else {
				await this.refreshDeviceCache()
				this.log.info('Device cache refreshed after recovery (fallback to full cache refresh).')
			}
			this.log.info('Immediate cache refresh completed successfully.')
		} catch (err) {
			this.log.error('Immediate cache refresh failed:', err)
		}
	}
}
