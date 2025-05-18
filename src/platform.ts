/**
 * Homebridge Platform Plugin for UniFi AP Lights
 * Implements the DynamicPlatformPlugin interface for Homebridge.
 * Handles configuration, device discovery, accessory management, and cache refresh logic.
 */
import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'
import { DeviceCache } from './cache/deviceCache.js'
import { UnifiConfigError, UnifiAPLightConfig } from './models/unifiTypes.js'
import { SessionManager } from './sessionManager.js'
import { RecoveryManager } from './platform/recoveryManager.js'
import { discoverDevices } from './platform/discovery.js'

export class UnifiAPLight implements DynamicPlatformPlugin {
	/** Parsed and validated config for the platform */
	public config: UnifiAPLightConfig
	/** Handles authentication and API requests to UniFi controller */
	public sessionManager: SessionManager
	/** Homebridge Service and Characteristic references */
	public readonly Service: typeof Service = this.api.hap.Service
	public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic
	/** List of currently managed accessories */
	private _accessories: PlatformAccessory[]
	/** Device cache for discovered UniFi APs */
	private deviceCache: DeviceCache = new DeviceCache()
	/** Device cache refresh interval in ms */
	private refreshIntervalMs: number
	/** Timer for periodic device cache refresh */
	private refreshTimer: NodeJS.Timeout | null = null
	/** Handles recovery and forced cache refresh */
	private recoveryManager: RecoveryManager

	/**
	 * Constructs the platform, validates config, and sets up event listeners.
	 * @param log Homebridge logger
	 * @param config Platform config
	 * @param api Homebridge API
	 */
	constructor(
		public readonly log: Logger,
		config: PlatformConfig,
		public readonly api: API,
	) {
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
		this.log.debug(`Initializing UniFi AP Light platform: ${this.config.name} (host: ${this.config.host})`)
		this.sessionManager = new SessionManager(this.config.host, this.config.username, this.config.password, this.log)
		// Set refresh interval (default 10 min)
		this.refreshIntervalMs = (typeof this.config.refreshIntervalMinutes === 'number' && this.config.refreshIntervalMinutes > 0
			? this.config.refreshIntervalMinutes
			: 10) * 60 * 1000
		this._accessories = []
		this.recoveryManager = new RecoveryManager(
			this.sessionManager,
			() => DeviceCache.refreshDeviceCache(this),
			this.log
		)
		// Start discovery after Homebridge launch
		this.api.on('didFinishLaunching', this.handleDidFinishLaunching.bind(this))
	}

	/**
	 * Handles Homebridge didFinishLaunching event: starts device discovery and cache refresh timer.
	 */
	private handleDidFinishLaunching() {
		this.log.debug('Finished loading, starting device discovery...')
		discoverDevices(this)
		this.startDeviceCacheRefreshTimer()
	}

	/**
	 * Validates the user config and throws UnifiConfigError on invalid config.
	 * @param config The config to validate
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
	 * Called by Homebridge to restore cached accessories on startup.
	 * @param accessory The cached accessory
	 */
	configureAccessory(accessory: PlatformAccessory): void {
		this.log.info(`Loading accessory from cache: ${accessory.displayName} (id: ${accessory.context.accessPoint?._id}, site: ${accessory.context.accessPoint?.site ?? 'unknown'})`)
		this._accessories.push(accessory)
	}

	/**
	 * Returns the list of currently managed accessories.
	 */
	public get accessories(): PlatformAccessory[] {
		return this._accessories
	}

	/**
	 * Returns the device cache instance.
	 */
	getDeviceCache(): DeviceCache {
		return this.deviceCache
	}

	/**
	 * Forces an immediate device cache refresh (used by recovery manager).
	 */
	public async forceImmediateCacheRefresh(): Promise<void> {
		return this.recoveryManager.forceImmediateCacheRefresh()
	}

	/**
	 * Public wrapper for device discovery (for tests/backward compatibility)
	 */
	public async discoverDevices(): Promise<void> {
		return discoverDevices(this)
	}

	/**
	 * Public wrapper for device cache refresh (for tests/backward compatibility)
	 */
	public async refreshDeviceCache(): Promise<void> {
		return DeviceCache.refreshDeviceCache(this)
	}

	/**
	 * Starts or restarts the periodic device cache refresh timer.
	 */
	private startDeviceCacheRefreshTimer(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer)
		}
		this.refreshTimer = setInterval(() => {
			DeviceCache.refreshDeviceCache(this)
		}, this.refreshIntervalMs)
		this.log.info(`Device cache refresh timer started (every ${this.refreshIntervalMs / 60000} minutes).`)
	}
}
