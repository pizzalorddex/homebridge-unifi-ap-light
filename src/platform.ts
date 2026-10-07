import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'
import { DeviceCache } from './cache/deviceCache.js'
import { UnifiConfigError, UnifiAPLightConfig } from './models/unifiTypes.js'
import { SessionManager } from './utils/sessionManager.js'
import { RecoveryManager } from './platform/recoveryManager.js'
import { discoverDevices } from './platform/discovery.js'
import { errorHandler } from './utils/errorHandler.js'

export class UnifiAPLight implements DynamicPlatformPlugin {
	public config: UnifiAPLightConfig
	public sessionManager!: SessionManager
	public readonly Service: typeof Service = this.api.hap.Service
	public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic
	private _accessories: PlatformAccessory[] = []
	private deviceCache: DeviceCache = new DeviceCache()
	private refreshIntervalMs = 10 * 60 * 1000
	private refreshTimer: NodeJS.Timeout | null = null
	private recoveryManager!: RecoveryManager
	private refreshPromise: Promise<void> | null = null
	public isShuttingDown = false

	constructor(
		public readonly log: Logger,
		config: PlatformConfig,
		public readonly api: API,
	) {
		const typedConfig = (config || {}) as UnifiAPLightConfig
		this.config = typedConfig
		try {
			this.validateConfig(typedConfig)
		} catch (err) {
			errorHandler(this.log, err)
			return
		}
		this.log.debug(`Initializing UniFi AP Light platform: ${this.config.name} (host: ${this.config.host})`)
		this.sessionManager = new SessionManager(this.config.host, this.config.username, this.config.password, this.log, { verifySsl: this.config.verifySsl, caFile: this.config.caFile })
		this.refreshIntervalMs = (typeof this.config.refreshIntervalMinutes === 'number' && this.config.refreshIntervalMinutes > 0
			? this.config.refreshIntervalMinutes
			: 10) * 60 * 1000
		this._accessories = []
		this.recoveryManager = new RecoveryManager(this)
		this.api.on('didFinishLaunching', this.handleDidFinishLaunching.bind(this))
		this.api.on('shutdown', () => {
			this.isShuttingDown = true
			if (this.refreshTimer) {
				clearInterval(this.refreshTimer)
				this.refreshTimer = null
			}
		})
	}

	private handleDidFinishLaunching() {
		this.log.debug('Finished loading, starting device discovery...')
		void this.discoverDevices().catch(err => errorHandler(this.log, err))
		this.startDeviceCacheRefreshTimer()
	}

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
		if (config.verifySsl !== undefined && typeof config.verifySsl !== 'boolean') {
			throw new UnifiConfigError('Config error: "verifySsl" must be a boolean.')
		}
		if (config.caFile !== undefined && (typeof config.caFile !== 'string' || !config.caFile.trim())) {
			throw new UnifiConfigError('Config error: "caFile" must be a nonempty file path.')
		}
		if (config.refreshIntervalMinutes !== undefined && (typeof config.refreshIntervalMinutes !== 'number' || !Number.isFinite(config.refreshIntervalMinutes) || config.refreshIntervalMinutes < 1 || config.refreshIntervalMinutes > 1440)) {
			throw new UnifiConfigError('Config error: "refreshIntervalMinutes" must be between 1 and 1440 minutes if provided.')
		}
	}

	configureAccessory(accessory: PlatformAccessory): void {
		this.log.info(`[Cache Restore] Registered cached accessory with Homebridge: ${accessory.displayName} (id: ${accessory.context.accessPoint?._id}, site: ${accessory.context.accessPoint?.site ?? 'unknown'})`)
		this._accessories.push(accessory)
	}

	public get accessories(): PlatformAccessory[] {
		return this._accessories
	}

	getDeviceCache(): DeviceCache {
		return this.deviceCache
	}

	public async forceImmediateCacheRefresh(): Promise<void> {
		return this.recoveryManager.forceImmediateCacheRefresh()
	}

	public async discoverDevices(): Promise<void> {
		return this.shareRefresh(() => discoverDevices(this))
	}

	public async refreshDeviceCache(): Promise<void> {
		return this.shareRefresh(() => DeviceCache.refreshDeviceCache(this))
	}

	private shareRefresh(refresh: () => Promise<void>): Promise<void> {
		if (this.isShuttingDown) {
			return Promise.resolve()
		}
		if (!this.refreshPromise) {
			const pending = Promise.resolve().then(refresh)
			this.refreshPromise = pending.finally(() => { this.refreshPromise = null })
		}
		return this.refreshPromise
	}

	private startDeviceCacheRefreshTimer(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer)
		}
		this.refreshTimer = setInterval(() => {
			void this.refreshDeviceCache().catch(err => errorHandler(this.log, err))
		}, this.refreshIntervalMs)
		this.log.debug(`Device cache refresh timer started (every ${this.refreshIntervalMs / 60000} minutes).`)
	}
}
