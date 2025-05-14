import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import { AxiosError, AxiosResponse } from 'axios'
import { UnifiDevice, UnifiApiError, UnifiAuthError, UnifiNetworkError } from './models/unifiTypes.js'

import { UnifiAPLight } from './platform.js'

/**
 * UniFiAP Homebridge Accessory
 * Represents a single UniFi AP as a HomeKit accessory, handling LED state and HomeKit interactions.
 *
 * @remarks
 * - Uses device cache for efficient state lookups.
 * - Surfaces errors to Homebridge and logs all failures.
 */
export class UniFiAP {
	// The underlying device object containing details like serial number and model
	accessPoint: UnifiDevice
	private service: Service

	constructor(
		private readonly platform: UnifiAPLight,
		private readonly accessory: PlatformAccessory,
	) {
		// Always use the latest cached device info
		const cached = this.platform.getDeviceCache().getDeviceById(this.accessory.context.accessPoint._id)
		this.accessPoint = cached || this.accessory.context.accessPoint

		// Fallback: Patch missing site property for cached accessories
		if (!this.accessPoint.site) {
			const configuredSites = this.platform.config.sites
			let fallbackSite = 'default'
			if (Array.isArray(configuredSites) && configuredSites.length === 1) {
				// Try to resolve the internal site name if possible
				const resolved = this.platform.sessionManager.getSiteName(configuredSites[0])
				fallbackSite = resolved || configuredSites[0] || 'default'
			}
			this.platform.log.warn(
				`Patching missing site for ${this.accessPoint.name}: using "${fallbackSite}"`
			)
			this.accessPoint.site = fallbackSite
			this.accessory.context.accessPoint = this.accessPoint
		}

		// Initialize accessory information from the configuration.
		const accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)
		if (accessoryInformationService) {
			accessoryInformationService
				.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Ubiquiti')
				.setCharacteristic(this.platform.Characteristic.Model, this.accessPoint.model)
				.setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessPoint.serial)
				.setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessPoint.version)
		} else {
			// Handle the case where the service is not available
			this.platform.log.warn('Accessory Information Service not found.')
		}

		// Create or retrieve the LightBulb service.
		this.service =
			this.accessory.getService(this.platform.Service.Lightbulb) ||
			this.accessory.addService(this.platform.Service.Lightbulb)

		// Set default HomeKit name based on the name stored in `accessory.context` from the `discoverDevices` method.
		this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessPoint.name)

		// Register handlers for the On/Off Characteristic.
		this.service.getCharacteristic(this.platform.Characteristic.On)
			.onSet(this.setOn.bind(this)) // SET - bind to the `setOn` method below
			.onGet(this.getOn.bind(this)) // GET - bind to the `getOn` method below
	}

	/**
	 * Handles "SET" requests from HomeKit to change the state of the accessory.
	 *
	 * @param {CharacteristicValue} value The new state from HomeKit.
	 * @returns {Promise<void>}
	 */
	async setOn(value: CharacteristicValue): Promise<void> {
		const isUdmDevice = this.accessPoint.type === 'udm'
		const site = this.accessPoint.site ?? 'default'
		const data = isUdmDevice
			? { ledSettings: { enabled: value } }
			: { led_override: value ? 'on' : 'off' }

		const endpoint = this.platform.sessionManager.getApiHelper().getDeviceUpdateEndpoint(site, this.accessPoint._id)
		try {
			const response: AxiosResponse = await this.platform.sessionManager.request({
				method: 'put',
				url: endpoint,
				data: data,
			})
			if (response.status === 200) {
				this.platform.log.debug(`Successfully set LED state for ${this.accessPoint.name} to ${value ? 'on' : 'off'}.`)
				// Update cache
				if (isUdmDevice && this.accessPoint.ledSettings) {
					this.accessPoint.ledSettings.enabled = Boolean(value)
				} else {
					this.accessPoint.led_override = value ? 'on' : 'off'
				}
				this.platform.getDeviceCache().setDevices([
					...this.platform.getDeviceCache().getAllDevices().filter(d => d._id !== this.accessPoint._id),
					this.accessPoint
				])
				return
			} else {
				this.platform.log.error(`Failed to set LED state for ${this.accessPoint.name}: Unexpected response status ${response.status}`)
			}
		} catch (error) {
			if (error instanceof UnifiAuthError || error instanceof UnifiApiError || error instanceof UnifiNetworkError) {
				this.platform.log.error(`Failed to set LED state for ${this.accessPoint.name}: ${error.message}`)
			} else {
				const axiosError = error as AxiosError
				this.platform.log.error(`Failed to set LED state for ${this.accessPoint.name}: ${axiosError.message}`)
			}
			// Optionally, set accessory to Not Responding
			this.service.updateCharacteristic(this.platform.Characteristic.On, new Error('Not Responding'))
		}
	}

	/**
	 * Handles "GET" requests from HomeKit to retrieve the current state of the accessory.
	 *
	 * @returns {Promise<CharacteristicValue>} The current state of the accessory.
	 */
	async getOn(): Promise<CharacteristicValue> {
		try {
			const cached = this.platform.getDeviceCache().getDeviceById(this.accessPoint._id)
			if (!cached) {
				this.platform.log.error(`Device ${this.accessPoint.name} not found in cache.`)
				this.service.updateCharacteristic(this.platform.Characteristic.On, new Error('Not Responding'))
				return false
			}
			if (cached.type === 'udm') {
				if (cached.ledSettings && typeof cached.ledSettings.enabled !== 'undefined') {
					const isOn = cached.ledSettings.enabled
					this.platform.log.debug(`Retrieved LED state for ${cached.name}: ${isOn ? 'on' : 'off'}`)
					return isOn
				} else {
					this.platform.log.error(`The 'enabled' property in 'ledSettings' is undefined for ${cached.name}`)
					this.service.updateCharacteristic(this.platform.Characteristic.On, new Error('Not Responding'))
					return false
				}
			} else {
				const isOn = cached.led_override === 'on'
				this.platform.log.debug(`Retrieved LED state for ${cached.name}: ${isOn ? 'on' : 'off'}`)
				return isOn
			}
		} catch (error) {
			if (error instanceof UnifiAuthError || error instanceof UnifiApiError || error instanceof UnifiNetworkError) {
				this.platform.log.error(`Failed to retrieve LED state for ${this.accessPoint.name}: ${error.message}`)
			} else {
				this.platform.log.error(`Failed to retrieve LED state for ${this.accessPoint.name}: ${error}`)
			}
			this.service.updateCharacteristic(this.platform.Characteristic.On, new Error('Not Responding'))
			return false
		}
	}
}
