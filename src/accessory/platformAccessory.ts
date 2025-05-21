import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import { UnifiDevice } from '../models/unifiTypes.js'
import { markAccessoryNotResponding, errorHandler } from '../utils/errorHandler.js'
import type { UnifiAPLight } from '../platform.js'

/**
 * UniFiAP Homebridge Accessory
 * Represents a single UniFi AP as a HomeKit accessory, handling LED state and HomeKit interactions.
 */
export class UniFiAP {
	accessPoint: UnifiDevice
	private service: Service

	/**
	 * Constructs a UniFiAP accessory, sets up context, services, and characteristics.
	 * @param platform - The Homebridge platform instance
	 * @param accessory - The Homebridge PlatformAccessory instance
	 */
	constructor(
		private readonly platform: UnifiAPLight,
		private readonly accessory: PlatformAccessory,
	) {
		const cached = this.platform.getDeviceCache().getDeviceById(this.accessory.context.accessPoint._id)
		this.accessPoint = cached || this.accessory.context.accessPoint

		// Patch missing site info if needed
		if (!this.accessPoint.site) {
			const configuredSites = this.platform.config.sites
			let fallbackSite = 'default'
			if (Array.isArray(configuredSites) && configuredSites.length === 1) {
				const resolved = this.platform.sessionManager.getSiteName(configuredSites[0])
				fallbackSite = resolved || configuredSites[0] || 'default'
			}
			this.platform.log.warn(`[Accessory] Patching missing site for ${this.accessPoint.name} (${this.accessPoint._id})`)
			this.accessPoint.site = fallbackSite
			this.accessory.context.accessPoint = this.accessPoint
		}

		const accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)
		if (accessoryInformationService) {
			accessoryInformationService
				.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Ubiquiti')
				.setCharacteristic(this.platform.Characteristic.Model, this.accessPoint.model)
				.setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessPoint.serial)
				.setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessPoint.version)
		} else {
			this.platform.log.warn(`[Accessory] Accessory Information Service not found for ${this.accessPoint.name} (${this.accessPoint._id})`)
		}

		this.service =
			this.accessory.getService(this.platform.Service.Lightbulb) ||
			this.accessory.addService(this.platform.Service.Lightbulb)

		this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessPoint.name)

		this.service.getCharacteristic(this.platform.Characteristic.On)
			.onSet(this.setOn.bind(this))
			.onGet(this.getOn.bind(this))
	}

	/**
	 * Handles "SET" requests from HomeKit to change the state of the accessory.
	 * @param value - The new state from HomeKit.
	 * @returns Promise<void>
	 */
	async setOn(value: CharacteristicValue): Promise<void> {
		const isUdmDevice = this.accessPoint.type === 'udm'
		const site = this.accessPoint.site ?? 'default'
		const data = isUdmDevice
			? { ledSettings: { enabled: value } }
			: { led_override: value ? 'on' : 'off' }

		const endpoint = this.platform.sessionManager.getApiHelper().getDeviceUpdateEndpoint(site, this.accessPoint._id)
		try {
			const response = await this.platform.sessionManager.request({
				method: 'put',
				url: endpoint,
				data: data,
			})
			if (response.status === 200) {
				this.platform.log.debug(`[Accessory] Successfully set LED state for ${this.accessPoint.name} (${this.accessPoint._id}) to ${value ? 'on' : 'off'}.`)
				// Update cache
				if (isUdmDevice && this.accessPoint.ledSettings) {
					this.accessPoint.ledSettings.enabled = Boolean(value)
				} else {
					this.accessPoint.led_override = value ? 'on' : 'off'
				}
				this.platform.getDeviceCache().setDevices([
					...this.platform.getDeviceCache().getAllDevices().filter((d: UnifiDevice) => d._id !== this.accessPoint._id),
					this.accessPoint
				])
				return
			} else {
				this.platform.log.error(`[Accessory] Failed to set LED state for ${this.accessPoint.name} (${this.accessPoint._id}): Unexpected response status ${response.status}`)
				// Do not update cache on error
			}
		} catch (error) {
			errorHandler(
				this.platform.log,
				error,
				{
					site: this.accessPoint.site,
					endpoint: `setOn for ${this.accessPoint.name} (${this.accessPoint._id})`
				}
			)
			markAccessoryNotResponding(this.platform, this.accessory)
			this.platform.getDeviceCache().clear()
			await this.platform.forceImmediateCacheRefresh()
		}
	}

	/**
	 * Handles "GET" requests from HomeKit to retrieve the current state of the accessory.
	 * @returns Promise<CharacteristicValue> The current state of the accessory.
	 */
	async getOn(): Promise<CharacteristicValue> {
		this.platform.log.debug(`[Accessory] HomeKit GET called for ${this.accessPoint.name} (${this.accessPoint._id})`)
		try {
			const cached = this.platform.getDeviceCache().getDeviceById(this.accessPoint._id)
			if (!cached) {
				errorHandler(
					this.platform.log,
					{ name: 'DeviceCacheError', message: 'Device not found in cache' },
					{ site: this.accessPoint.site, endpoint: 'getOn' }
				)
				markAccessoryNotResponding(this.platform, this.accessory)
				await this.platform.forceImmediateCacheRefresh()
				throw new Error('Not Responding')
			}
			if (cached.type === 'udm') {
				if (cached.ledSettings && typeof cached.ledSettings.enabled !== 'undefined') {
					const isOn = cached.ledSettings.enabled
					this.platform.log.debug(`[Accessory] Retrieved LED state for ${cached.name} (${cached._id}): ${isOn ? 'on' : 'off'}`)
					return isOn
				} else {
					errorHandler(
						this.platform.log,
						{ name: 'DeviceCacheError', message: '\'enabled\' property in \'ledSettings\' is undefined' },
						{ site: this.accessPoint.site, endpoint: 'getOn' }
					)
					markAccessoryNotResponding(this.platform, this.accessory)
					throw new Error('Not Responding')
				}
			} else {
				const isOn = cached.led_override === 'on'
				this.platform.log.debug(`[Accessory] Retrieved LED state for ${cached.name} (${cached._id}): ${isOn ? 'on' : 'off'}`)
				return isOn
			}
		} catch (error) {
			errorHandler(
				this.platform.log,
				error,
				{
					site: this.accessPoint.site,
					endpoint: `getOn for ${this.accessPoint.name} (${this.accessPoint._id})`
				}
			)
			markAccessoryNotResponding(this.platform, this.accessory)
			await this.platform.forceImmediateCacheRefresh()
			throw new Error('Not Responding')
		}
	}
}
