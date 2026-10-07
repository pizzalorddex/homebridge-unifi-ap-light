import type { UnifiAPLight } from '../platform.js'
import { UnifiApiHelper } from '../api/unifiApiHelper.js'
import { getAccessPoints } from '../unifi.js'
import { filterRelevantAps } from '../utils/apFilter.js'
import { errorHandler } from '../utils/errorHandler.js'
import { shouldLogError, getErrorKey } from '../utils/errorLogManager.js'

/** Refreshes the device cache after a connection failure. */
export class RecoveryManager {
	private isRecoveryInProgress = false

	constructor(private readonly platform: UnifiAPLight) {}

	public async forceImmediateCacheRefresh(): Promise<void> {
		if (this.isRecoveryInProgress) {
			const infoKey = getErrorKey(
				'RecoveryInfo',
				'Immediate cache refresh already in progress.',
				'endpoint: forceImmediateCacheRefresh'
			)
			const { logLevel } = shouldLogError(
				infoKey,
				'Immediate cache refresh already in progress.',
				'info'
			)
			if (logLevel !== 'none') {
				this.platform.log.info('[API] Info [endpoint: forceImmediateCacheRefresh]: Immediate cache refresh already in progress.')
			}
			return
		}
		this.isRecoveryInProgress = true
		try {
			await this.platform.sessionManager.authenticate()

			const configSites = this.platform.config.sites?.length ? this.platform.config.sites : ['default']
			const resolvedSites: string[] = []
			for (const site of configSites) {
				const internal = this.platform.sessionManager.getSiteName(site)
				if (internal) {
					resolvedSites.push(internal)
				}
			}
			if (!resolvedSites.length) {
				errorHandler(this.platform.log, { name: 'RecoveryError', message: 'No valid sites resolved. Aborting recovery cache refresh.' }, { endpoint: 'forceImmediateCacheRefresh' })
				return
			}
			const apiHelper = this.platform.sessionManager.getApiHelper()
			const allDevices = await getAccessPoints(
				this.platform.sessionManager.request.bind(this.platform.sessionManager),
				apiHelper,
				resolvedSites,
				this.platform.log
			)

			const includeIds = this.platform.config.includeIds
			const excludeIds = this.platform.config.excludeIds
			const relevantAps = filterRelevantAps(allDevices, includeIds, excludeIds)

			const readyDevices = relevantAps.filter(UnifiApiHelper.isDeviceReady)
			if (!readyDevices.length) {
				errorHandler(this.platform.log, { name: 'RecoveryWarn', message: 'No relevant UniFi APs are ready after controller recovery. Will not update cache or accessories.' }, { endpoint: 'forceImmediateCacheRefresh' })
				return
			}
			this.platform.getDeviceCache().setDevices(readyDevices)
			this.platform.log.debug(`[Cache Refresh] Device cache refreshed after recovery. ${readyDevices.length} devices are ready and available.`)
			errorHandler(this.platform.log, { name: 'RecoveryInfo', message: 'Immediate cache refresh completed successfully.' }, { endpoint: 'forceImmediateCacheRefresh' })
		} catch (err) {
			errorHandler(this.platform.log, { name: 'RecoveryError', message: 'Immediate cache refresh failed', error: err instanceof Error ? err.message : String(err) }, { endpoint: 'forceImmediateCacheRefresh' })
		} finally {
			this.isRecoveryInProgress = false
		}
	}
}
