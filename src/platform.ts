import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'
import Axios, { AxiosInstance, AxiosError } from 'axios'
import jwt from 'jsonwebtoken'
import https from 'https'
import cookie from 'cookie'

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
 * Manages authentication sessions and re-authentication.
 */
class SessionManager {
	private axiosInstance: AxiosInstance
	private host: string
	private username: string
	private password: string
	private log: Logger

	constructor(host: string, username: string, password: string, log: Logger) {
		this.host = host
		this.username = username
		this.password = password
		this.log = log

		// Initialize Axios instance with baseURL
		this.axiosInstance = Axios.create({
			baseURL: `https://${host}`,
			httpsAgent: new https.Agent({ rejectUnauthorized: false }),
		})
	}

	/**
	 * Attempts to authenticate using the primary method, with a fallback to the secondary method upon failure.
	 */
	async authenticate() {
		try {
			await this.primaryAuthMethod()
		} catch (error) {
			this.log.debug('Primary authentication method failed, attempting secondary.')
			try {
				await this.secondaryAuthMethod()
			} catch (fallbackError) {
				this.log.error(`Both authentication methods failed: ${fallbackError}`)
			}
		}
	}

	private async primaryAuthMethod() {
		const response = await this.axiosInstance.post('/api/login', {
			username: this.username,
			password: this.password,
		})

		if (response.headers['set-cookie']) {
			this.axiosInstance.defaults.headers['Cookie'] = response.headers['set-cookie'].join('; ')
			this.log.debug('Authentication with primary method successful.')
		} else {
			throw new Error('Primary authentication method failed: No cookies found.')
		}
	}

	private async secondaryAuthMethod() {
		const { headers } = await this.axiosInstance.post('/api/auth/login', {
			username: this.username,
			password: this.password,
			rememberMe: true,
		})

		if(!headers['set-cookie']) {
			throw new Error('Secondary authentication method failed: No cookies found.')
		}

		const cookies = cookie.parse(headers['set-cookie'].join('; '))
		const token = cookies['TOKEN']
		const decoded = jwt.decode(token)
		const csrfToken = decoded ? decoded.csrfToken : null

		if (!csrfToken) {
			throw new Error('Secondary authentication method failed: CSRF token not found.')
		}

		// Assuming CSRF token needs to be sent as a header for subsequent requests
		this.axiosInstance.defaults.headers['X-Csrf-Token'] = csrfToken
		this.axiosInstance.defaults.headers['Cookie'] += `; TOKEN=${token}` // Append TOKEN cookie
        
		this.log.debug('Authentication with secondary method successful.')
	}

	/**
	 * Handles API requests, automatically re-authenticating if necessary.
	 */
	async request(config) {
		try {
			return await this.axiosInstance(config)
		} catch (error) {
			const axiosError = error as AxiosError
			if (axiosError.response && axiosError.response.status === 401) {
				this.log.debug('Session expired, attempting to re-authenticate...')
				await this.authenticate()
				return await this.axiosInstance(config) // Retry the request after re-authentication
			} else {
				throw axiosError
			}
		}
	}
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
