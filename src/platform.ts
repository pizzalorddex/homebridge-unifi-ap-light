import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'
import { AxiosError } from 'axios'
import { DeviceCache } from './cache/deviceCache.js'
import { UnifiDevice, UnifiApiError, UnifiAuthError, UnifiNetworkError, UnifiConfigError, UnifiAPLightConfig } from './models/unifiTypes.js'

import { SessionManager } from './sessionManager.js'
import { UniFiAP } from './platformAccessory.js'
import { getAccessPoints } from './unifi.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

/**
 * UnifiAPLight Homebridge Platform
 * Handles device discovery, registration, and periodic device cache refresh for UniFi APs.
 *
 * @remarks
 * - Device discovery and cache refresh are robust against network/API errors.
 * - All errors are logged and surfaced to Homebridge where possible.
 * - Configuration is validated at runtime for required fields and values.
 */
export class UnifiAPLight implements DynamicPlatformPlugin {
	public config: UnifiAPLightConfig
	public sessionManager: SessionManager
	public readonly Service: typeof Service = this.api.hap.Service
	public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic
	public readonly accessories: PlatformAccessory[] = []
	private deviceCache: DeviceCache = new DeviceCache()
	private refreshIntervalMs: number // Set refresh interval from config or default to 10 minutes
	private refreshTimer: NodeJS.Timeout | null = null

	constructor(
		public readonly log: Logger,
		config: PlatformConfig,
		public readonly api: API,
	) {
		// Cast config to UnifiAPLightConfig before validation
		const typedConfig = config as UnifiAPLightConfig
		this.config = typedConfig
		try {
			this.validateConfig(typedConfig)
		} catch (err) {
			if (err instanceof UnifiConfigError) {
				this.log.error(err.message)
				throw err
			} else {
				throw err
			}
		}
		this.log.debug('Initializing UniFi AP Light platform:', this.config.name)

		this.sessionManager = new SessionManager(this.config.host, this.config.username, this.config.password, this.log)

		this.refreshIntervalMs = (typeof this.config.refreshIntervalMinutes === 'number' && this.config.refreshIntervalMinutes > 0
			? this.config.refreshIntervalMinutes
			: 10) * 60 * 1000

		this.api.on('didFinishLaunching', () => {
			this.log.debug('Finished loading, starting device discovery.')
			this.discoverDevices()
			this.startDeviceCacheRefreshTimer()
		})
	}

	/**
	 * Validates the platform configuration at runtime.
	 *
	 * @param {UnifiAPLightConfig} config The configuration object to validate.
	 * @throws {UnifiConfigError} If the config is invalid.
	 */
	private validateConfig(config: UnifiAPLightConfig) {
		if (!config.host || typeof config.host !== 'string') {
			throw new UnifiConfigError('Config error: "host" is required and must be a string.')
		}
		if (!config.username || typeof config.username !== 'string') {
			throw new UnifiConfigError('Config error: "username" is required and must be a string.')
		}
		if (!config.password || typeof config.password !== 'string') {
			throw new UnifiConfigError('Config error: "password" is required and must be a string.')
		}
		if (config.sites && !Array.isArray(config.sites)) {
			throw new UnifiConfigError('Config error: "sites" must be an array of strings if provided.')
		}
		if (config.includeIds && !Array.isArray(config.includeIds)) {
			throw new UnifiConfigError('Config error: "includeIds" must be an array of strings if provided.')
		}
		if (config.excludeIds && !Array.isArray(config.excludeIds)) {
			throw new UnifiConfigError('Config error: "excludeIds" must be an array of strings if provided.')
		}
		if (config.refreshIntervalMinutes !== undefined && (typeof config.refreshIntervalMinutes !== 'number' || config.refreshIntervalMinutes <= 0)) {
			throw new UnifiConfigError('Config error: "refreshIntervalMinutes" must be a positive number if provided.')
		}
	}

	/**
	 * Restore cached accessories from disk at startup.
	 *
	 * @param {PlatformAccessory} accessory The accessory to restore.
	 * @returns {void}
	 */
	configureAccessory(accessory: PlatformAccessory): void {
		this.log.info('Loading accessory from cache:', accessory.displayName)
		this.accessories.push(accessory)
	}

	/**
	 * Helper to provide a request function with apiHelper property for getAccessPoints
	 *
	 * @returns {Function} The request function with apiHelper property attached.
	 */
	private getApiRequestWithHelper() {
		const request = this.sessionManager.request.bind(this.sessionManager) as typeof this.sessionManager.request & { apiHelper: any }
		request.apiHelper = this.sessionManager.getApiHelper()
		return request
	}

	/**
	 * Discovers and registers new devices as HomeKit accessories based on the UniFi controller data.
	 *
	 * @returns {Promise<void>}
	 */
	async discoverDevices(): Promise<void> {
		try {
			await this.sessionManager.authenticate()
		} catch (err) {
			if (err instanceof UnifiAuthError) {
				this.log.error('Authentication failed during device discovery: ' + err.message)
			} else {
				this.log.error('Unexpected error during authentication: ' + (err as Error).message)
			}
			return
		}

		try {
			// Determine target sites: use provided list or fallback to ['default']
			const siteInput = this.config.sites?.length ? this.config.sites : ['default']

			// Resolve friendly site names (desc) to internal UniFi site names
			const resolvedSites: string[] = []
			for (const site of siteInput) {
				const internal = this.sessionManager.getSiteName(site)
				if (internal) {
					resolvedSites.push(internal)
				} else {
					this.log.warn(`Site "${site}" is not recognized by the UniFi controller.`)
				}
			}

			if (!resolvedSites.length) {
				this.log.error('No valid sites resolved. Aborting discovery.')
				return
			}

			// Fetch all devices once, store in cache
			const accessPoints: UnifiDevice[] = await getAccessPoints(
				this.sessionManager.request.bind(this.sessionManager),
				this.sessionManager.getApiHelper(),
				resolvedSites,
				this.log
			)
			this.deviceCache.setDevices(accessPoints)

			if (!accessPoints.length) {
				this.log.warn('No access points discovered. Check your site configuration and permissions.')
			}

			// Process each access point to determine if it should be included or excluded.
			for (const accessPoint of accessPoints) {
				// Generate a unique identifier for the HomeKit accessory based on the access point ID.
				const uuid = this.api.hap.uuid.generate(accessPoint._id)

				// Determine inclusion by checking against includeIds, or include all if not set.
				const isIncluded = this.config.includeIds?.length ? this.config.includeIds.includes(accessPoint._id) : true
				// Determine exclusion by checking against excludeIds, defaulting to false if not set.
				const isExcluded = this.config.excludeIds?.includes(accessPoint._id) || false

				// Find if there is already an accessory registered in Homebridge with the same UUID.
				const existingAccessory = this.accessories.find(acc => acc.UUID === uuid)

				if (existingAccessory) {
					if (!isIncluded || isExcluded) {
						// If the accessory is not included or explicitly excluded, remove it from Homebridge.
						this.log.info(`Removing accessory from cache due to exclusion settings: ${existingAccessory.displayName} (${accessPoint._id})`)
						this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory])
					} else {
						// If the accessory exists and is still included, restore it from cache without re-registering.
						this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} (${accessPoint._id})`)
						new UniFiAP(this, existingAccessory)
					}
				} else if (isIncluded && !isExcluded) {
					// If the accessory is new, included, and not excluded, register it as a new accessory.
					this.log.info(`Adding new accessory: ${accessPoint.name} (${accessPoint._id})`)
					const newAccessory = new this.api.platformAccessory(accessPoint.name, uuid)
					newAccessory.context.accessPoint = accessPoint
					new UniFiAP(this, newAccessory)
					this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newAccessory])
				}
			}
		} catch (error) {
			if (error instanceof UnifiApiError || error instanceof UnifiNetworkError) {
				this.log.error(`Device discovery failed: ${error.message}`)
			} else {
				const axiosError = error as AxiosError
				this.log.error(`Device discovery failed: ${axiosError.message}`)
			}
		}
	}

	/**
	 * Periodically refreshes the device cache by fetching the latest device list from the UniFi controller.
	 *
	 * @returns {Promise<void>}
	 */
	private async refreshDeviceCache(): Promise<void> {
		try {
			// Determine which sites to refresh (use config or default)
			const siteInput = this.config.sites?.length ? this.config.sites : ['default']
			const resolvedSites: string[] = []
			for (const site of siteInput) {
				const internal = this.sessionManager.getSiteName(site)
				if (internal) {
					resolvedSites.push(internal)
				}
			}
			if (!resolvedSites.length) {
				this.log.error('No valid sites resolved. Aborting device cache refresh.')
				return
			}
			let accessPoints: UnifiDevice[] = []
			try {
				// Try to fetch devices using the current session and cached API structure
				accessPoints = await getAccessPoints(
					this.sessionManager.request.bind(this.sessionManager),
					this.sessionManager.getApiHelper(),
					resolvedSites,
					this.log
				)
			} catch (err) {
				// If the session is expired or API structure is invalid, re-authenticate and try again
				this.log.warn('Device cache refresh failed, attempting re-authentication...')
				await this.sessionManager.authenticate()
				accessPoints = await getAccessPoints(
					this.sessionManager.request.bind(this.sessionManager),
					this.sessionManager.getApiHelper(),
					resolvedSites,
					this.log
				)
			}
			// Update the device cache with the latest device list
			this.deviceCache.setDevices(accessPoints)
			this.log.info(`Device cache refreshed. ${accessPoints.length} devices currently available.`)
		} catch (err) {
			if (err instanceof UnifiAuthError) {
				this.log.error('Device cache refresh failed: Failed to detect UniFi API structure during authentication');
			} else if (err instanceof UnifiApiError || err instanceof UnifiNetworkError) {
				this.log.error(`Device cache refresh failed: ${err.message}`)
			} else if (err instanceof Error) {
				this.log.error(`Device cache refresh failed: ${err.message}`)
			} else if (typeof err === 'string') {
				// Handles thrown string errors
				this.log.error('Device cache refresh failed:', err)
			} else {
				// Handles thrown non-Error objects
				this.log.error('Device cache refresh failed:', err)
			}
		}
	}

	/**
	 * Starts the timer for periodic device cache refresh.
	 *
	 * @returns {void}
	 */
	private startDeviceCacheRefreshTimer(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer)
		}
		this.refreshTimer = setInterval(() => {
			this.refreshDeviceCache()
		}, this.refreshIntervalMs)
		this.log.info(`Device cache refresh timer started (every ${this.refreshIntervalMs / 60000} minutes).`)
	}

	/**
	 * Returns the current device cache instance.
	 *
	 * @returns {DeviceCache}
	 */
	getDeviceCache(): DeviceCache {
		return this.deviceCache
	}
}
