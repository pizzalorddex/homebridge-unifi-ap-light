import { Logger } from 'homebridge'
import { SessionManager } from '../utils/sessionManager.js'
import { UnifiApiHelper } from '../api/unifiApiHelper.js'
import { getAccessPoints } from '../unifi.js'
import { filterRelevantAps } from '../utils/apFilter.js'
import { errorHandler } from '../utils/errorHandler.js'
import { shouldLogError, getErrorKey } from '../utils/errorLogManager.js'

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
		// Suppress the info log using errorLogManager
		const infoKey = getErrorKey(
			'RecoveryInfo',
			'Immediate cache refresh requested (triggered by accessory error).',
			'endpoint: forceImmediateCacheRefresh'
		)
		const { logLevel } = shouldLogError(
			infoKey,
			'Immediate cache refresh requested (triggered by accessory error).',
			'info'
		)
		if (logLevel !== 'none') {
			this.log.info('[API] Info [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh requested (triggered by accessory error).')
		}
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
				errorHandler(this.log, { name: 'RecoveryError', message: 'No valid sites resolved. Aborting recovery cache refresh.' }, { endpoint: 'forceImmediateCacheRefresh' })
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
				errorHandler(this.log, { name: 'RecoveryWarn', message: 'No relevant UniFi APs are ready after controller recovery. Will not update cache or accessories.' }, { endpoint: 'forceImmediateCacheRefresh' })
				return
			}
			// Update the device cache with only ready devices
			if (platform && typeof platform.getDeviceCache === 'function') {
				platform.getDeviceCache().setDevices(readyDevices)
				this.log.debug(`[Cache Refresh] Device cache refreshed after recovery. ${readyDevices.length} devices are ready and available.`)
			} else {
				await this.refreshDeviceCache()
				this.log.debug('[Cache Refresh] Device cache refreshed after recovery (fallback to full cache refresh).')
			}
			// Log as info, not error, for successful completion
			errorHandler(this.log, { name: 'RecoveryInfo', message: 'Immediate cache refresh completed successfully.' }, { endpoint: 'forceImmediateCacheRefresh' })
		} catch (err) {
			errorHandler(this.log, { name: 'RecoveryError', message: 'Immediate cache refresh failed', error: err instanceof Error ? err.message : String(err) }, { endpoint: 'forceImmediateCacheRefresh' })
		}
	}
}
