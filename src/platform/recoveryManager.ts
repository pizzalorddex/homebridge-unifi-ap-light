import { Logger } from 'homebridge'
import { SessionManager } from '../sessionManager.js'

/**
 * Handles platform recovery actions such as immediate re-authentication and device cache refresh.
 */
export class RecoveryManager {
	constructor(
    private readonly sessionManager: SessionManager,
    private readonly refreshDeviceCache: () => Promise<void>,
    private readonly log: Logger
	) {}

	/**
   * Immediately re-authenticates and refreshes the device cache.
   * Can be called by accessories after a network/API error for fast recovery.
   *
   * @returns {Promise<void>}
   */
	public async forceImmediateCacheRefresh(): Promise<void> {
		this.log.info('Immediate cache refresh requested (triggered by accessory error).')
		try {
			await this.sessionManager.authenticate()
			await this.refreshDeviceCache()
			this.log.info('Immediate cache refresh completed successfully.')
		} catch (err) {
			this.log.error('Immediate cache refresh failed:', err)
		}
	}
}
