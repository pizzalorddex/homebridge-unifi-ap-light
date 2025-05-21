/**
 * Helper for UniFi API structure detection and endpoint management.
 *
 * Detects whether the controller is self-hosted or UniFi OS, and provides
 * the correct API endpoints for device and site operations.
 */
import { AxiosInstance } from 'axios'
import { Logger } from 'homebridge'

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
	async detectApiType(instance: AxiosInstance, username: string, password: string, log: Logger): Promise<UnifiApiType> {
		try {
			log.debug('[API] Trying UniFi OS authentication... [endpoint: /api/auth/login]')
			await instance.post('/api/auth/login', { username, password, rememberMe: true })
			this.apiType = UnifiApiType.UnifiOS
			log.debug('[API] Detected UniFi OS API structure.')
			return this.apiType
		} catch {
			// Try self-hosted
			try {
				log.debug('[API] Trying self-hosted authentication... [endpoint: /api/login]')
				await instance.post('/api/login', { username, password })
				this.apiType = UnifiApiType.SelfHosted
				log.debug('[API] Detected self-hosted API structure.')
				return this.apiType
			} catch (err) {
				log.error('[API] Failed to detect UniFi API structure (tried /api/auth/login and /api/login):', err)
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

	/**
	 * Get the correct endpoint for fetching a single device by MAC address in a site.
	 *
	 * @param {string} site The site name.
	 * @param {string} mac The device's MAC address.
	 * @returns {string} The API endpoint for single device info.
	 */
	getSingleDeviceEndpoint(site: string, mac: string): string {
		if (this.apiType === UnifiApiType.UnifiOS) {
			return `/proxy/network/api/s/${site}/stat/device/${mac}`
		} else {
			return `/api/s/${site}/stat/device/${mac}`
		}
	}

	/**
	 * Determines if a UniFi device is truly ready (controller and device are fully online).
	 * @param device The device object returned from the UniFi API.
	 * @returns boolean True if the device is ready, false otherwise.
	 */
	static isDeviceReady(device: any): boolean {
		// last_seen and uptime must be positive numbers to be considered ready
		if (typeof device.last_seen === 'number' && typeof device.uptime === 'number') {
			if (device.last_seen > 0 && device.uptime > 0) {
				return true
			}
			return false
		}
		// Optionally, check state === 1 (but this may not be universal)
		if (device.state === 1) {
			return true
		}
		return false
	}
}
