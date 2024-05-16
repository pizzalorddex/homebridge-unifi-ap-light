import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'
import { AxiosError } from 'axios'

import { SessionManager } from './sessionManager'
import { UniFiAP } from './platformAccessory'
import { getAccessPoints } from './unifi'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings'

interface UnifiAPLightConfig extends PlatformConfig {
    host: string // Hostname and port, e.g., "localhost:8443"
    username: string // Username for authentication
    password: string // Password for authentication
    includeIds?: string[] // Optional array of IDs to specifically include
    excludeIds?: string[] // Optional array of IDs to specifically exclude
}

/**
 * Main class for the Homebridge platform plugin, handling device discovery and accessory registration.
 */
export class UnifiAPLight implements DynamicPlatformPlugin {
	public sessionManager: SessionManager
	public readonly Service: typeof Service = this.api.hap.Service
	public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic

	// Cache for restored accessories to prevent duplicates
	public readonly accessories: PlatformAccessory[] = []

	constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
	) {
		// Assert and assign the config to this.config directly as UnifiAPLightConfig
		this.config = config as UnifiAPLightConfig
		this.log.debug('Initializing UniFi AP Light platform:', this.config.name)

		this.sessionManager = new SessionManager(this.config.host, this.config.username, this.config.password, this.log)

		this.api.on('didFinishLaunching', () => {
			this.log.debug('Finished loading, starting device discovery.')
			this.discoverDevices()
		})
	}

	/**
	 * Restore cached accessories from disk at startup.
	 * This is primarily used for setting up event handlers for accessory characteristics and updating their values as needed.
	 */
	configureAccessory(accessory: PlatformAccessory) {
		this.log.info('Loading accessory from cache:', accessory.displayName)

		// Add the restored accessory to the accessories cache to track if it was previously registered
		this.accessories.push(accessory)
	}

	/**
 * Discovers and registers new devices as HomeKit accessories based on the UniFi controller data.
 */
	async discoverDevices() {
		// Authenticate with the UniFi controller before attempting to discover devices.
		await this.sessionManager.authenticate()

		try {
			// Fetch the list of UniFi access points from the controller.
			const accessPoints = await getAccessPoints(this.sessionManager.request.bind(this.sessionManager))

			// Process each access point to determine if it should be included or excluded.
			accessPoints.forEach(accessPoint => {
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
			})
		} catch (error) {
			const axiosError = error as AxiosError
			// Log detailed errors if the device discovery fails.
			this.log.error(`Device discovery failed: ${axiosError.message}`)
		}
	}
}
