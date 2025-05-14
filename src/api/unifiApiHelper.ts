/**
 * Helper for UniFi API structure detection and endpoint management.
 *
 * Detects whether the controller is self-hosted or UniFi OS, and provides
 * the correct API endpoints for device and site operations.
 */
import { AxiosInstance } from 'axios'

/**
 * Enum for UniFi API structure types.
 */
export enum UnifiApiType {
	SelfHosted = 'self-hosted',
	UnifiOS = 'unifi-os',
}

/**
 * Encapsulates API structure detection and endpoint resolution for UniFi controllers.
 *
 * Usage:
 *   1. Call detectApiType() once after creating an Axios instance.
 *   2. Use getDeviceListEndpoint(), getDeviceUpdateEndpoint(), etc. for all API calls.
 */
export class UnifiApiHelper {
	private apiType: UnifiApiType | null = null

	/**
	 * Detects the API structure by attempting login endpoints.
	 * Caches the result for future use.
	 *
	 * @param {AxiosInstance} instance Axios instance to use for requests.
	 * @param {string} username UniFi controller username.
	 * @param {string} password UniFi controller password.
	 * @param {any} log Logger for debug output.
	 * @returns {Promise<UnifiApiType>} The detected API type.
	 * @throws {Error} If neither endpoint succeeds.
	 */
	async detectApiType(instance: AxiosInstance, username: string, password: string, log: any): Promise<UnifiApiType> {
		try {
			log.debug('Trying UniFi OS authentication...')
			await instance.post('/api/auth/login', { username, password, rememberMe: true })
			this.apiType = UnifiApiType.UnifiOS
			log.debug('Detected UniFi OS API structure.')
			return this.apiType
		} catch {
			// Try self-hosted
			try {
				log.debug('Trying self-hosted authentication...')
				await instance.post('/api/login', { username, password })
				this.apiType = UnifiApiType.SelfHosted
				log.debug('Detected self-hosted API structure.')
				return this.apiType
			} catch (err) {
				log.error('Failed to detect UniFi API structure:', err)
				throw new Error('Unable to detect UniFi API structure.')
			}
		}
	}

	/**
	 * Manually set the API type (rarely needed).
	 *
	 * @param {UnifiApiType} type The API type to set.
	 * @returns {void}
	 */
	setApiType(type: UnifiApiType): void {
		this.apiType = type
	}

	/**
	 * Get the currently detected API type, or null if not detected yet.
	 *
	 * @returns {UnifiApiType|null}
	 */
	getApiType(): UnifiApiType | null {
		return this.apiType
	}

	/**
	 * Get the correct endpoint for fetching all devices in a site.
	 *
	 * @param {string} site The site name.
	 * @returns {string} The API endpoint for device list.
	 */
	getDeviceListEndpoint(site: string): string {
		if (this.apiType === UnifiApiType.UnifiOS) {
			return `/proxy/network/api/s/${site}/stat/device`
		} else {
			return `/api/s/${site}/stat/device`
		}
	}

	/**
	 * Get the correct endpoint for updating a device in a site.
	 *
	 * @param {string} site The site name.
	 * @param {string} deviceId The device's unique ID.
	 * @returns {string} The API endpoint for device update.
	 */
	getDeviceUpdateEndpoint(site: string, deviceId: string): string {
		if (this.apiType === UnifiApiType.UnifiOS) {
			return `/proxy/network/api/s/${site}/rest/device/${deviceId}`
		} else {
			return `/api/s/${site}/rest/device/${deviceId}`
		}
	}

	/**
	 * Get the correct endpoint for fetching all sites.
	 *
	 * @returns {string} The API endpoint for site list.
	 */
	getSitesEndpoint(): string {
		if (this.apiType === UnifiApiType.UnifiOS) {
			return '/proxy/network/api/self/sites'
		} else {
			return '/api/self/sites'
		}
	}
}
