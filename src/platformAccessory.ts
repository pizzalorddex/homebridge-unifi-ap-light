import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import { AxiosError, AxiosResponse } from 'axios'

import { UnifiAPLight } from './platform.js'
import { getAccessPoint } from './unifi.js'

/**
 * This class represents a single platform accessory (e.g., a UniFi access point) for Homebridge.
 * It handles the lifecycle and HomeKit interactions for individual accessories.
 */
export class UniFiAP {
	// The underlying device object containing details like serial number and model
	accessPoint: any
	private service: Service

	constructor(
		private readonly platform: UnifiAPLight,
		private readonly accessory: PlatformAccessory,
	) {
		this.accessPoint = this.accessory.context.accessPoint

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
	 * @param {CharacteristicValue} value - The new state from HomeKit.
	 */
	async setOn(value: CharacteristicValue) {
		// Determine if this is a UDM-based device with nested LED settings
		const isUdmDevice = this.accessPoint.type === 'udm'
		const site = this.accessPoint.site ?? 'default'

		// Choose the correct API payload based on device type
		const data = isUdmDevice
			? { ledSettings: { enabled: value } }
			: { led_override: value ? 'on' : 'off' }

		// Define API endpoints to try in sequence (some UniFi setups use different URL structures)
		const endpoints = [
			`/api/s/${site}/rest/device/${this.accessPoint._id}`,
			`/proxy/network/api/s/${site}/rest/device/${this.accessPoint._id}`
		]

		// Try each endpoint until one works or all fail
		for (const endpoint of endpoints) {
			try {
				const response: AxiosResponse = await this.platform.sessionManager.request({
					method: 'put',
					url: endpoint,
					data: data,
				})
				if (response.status === 200) {
					this.platform.log.debug(`Successfully set LED state for ${this.accessPoint.name} to ${value ? 'on' : 'off'}.`)
					return
				} else {
					this.platform.log.error(`Failed to set LED state for ${this.accessPoint.name}: Unexpected response status ${response.status}`)
				}
			} catch (error) {
				const axiosError = error as AxiosError
				// Try next fallback endpoint if 404
				if (axiosError.response && axiosError.response.status === 404 && endpoint !== endpoints[endpoints.length - 1]) {
					continue
				} else {
					// Log full error details for debugging
					this.platform.log.error(`Failed to set LED state for ${this.accessPoint.name}: ${error}`)
					if (axiosError.response) {
						this.platform.log.error(`Response status: ${axiosError.response.status}`)
						this.platform.log.error(`Response data: ${JSON.stringify(axiosError.response.data)}`)
					}
					break
				}
			}
		}
	}

	/**
	 * Handles "GET" requests from HomeKit to retrieve the current state of the accessory.
	 * @returns {Promise<CharacteristicValue>} - The current state of the accessory.
	 */
	async getOn(): Promise<CharacteristicValue> {
		try {
			// Use the site name already attached to the AP context
			const site = this.accessPoint.site
			if (!site) {
				this.platform.log.error(`Access point ${this.accessPoint.name} is missing site information.`)
				return false
			}

			// Re-fetch the latest AP state using the current site
			const accessPoint = await getAccessPoint(
				this.accessPoint._id,
				this.platform.sessionManager.request.bind(this.platform.sessionManager),
				[site],
				this.platform.log
			)

			// Process valid AP response
			if (accessPoint) {
				if (accessPoint.type === 'udm') {
					// UDM devices use nested `ledSettings.enabled`
					if (accessPoint.ledSettings) {
						if (typeof accessPoint.ledSettings.enabled !== 'undefined') {
							const isOn = accessPoint.ledSettings.enabled
							this.platform.log.debug(`Retrieved LED state for ${this.accessPoint.name}: ${isOn ? 'on' : 'off'}`)
							return isOn
						} else {
							this.platform.log.error(`The 'enabled' property in 'ledSettings' is undefined for ${this.accessPoint.name}`)
							return false
						}
					} else {
						this.platform.log.error(`The 'ledSettings' property is undefined for ${this.accessPoint.name}`)
						return false
					}
				} else {
					// Standard APs use the flat `led_override` field
					const isOn = accessPoint.led_override === 'on'
					this.platform.log.debug(`Retrieved LED state for ${this.accessPoint.name}: ${isOn ? 'on' : 'off'}`)
					return isOn
				}
			} else {
				this.platform.log.error(`Failed to retrieve LED state for ${this.accessPoint.name}: Access point not found`)
				return false
			}
		} catch (error) {
			// Handle network or API errors gracefully
			this.platform.log.error(`Failed to retrieve LED state for ${this.accessPoint.name}: ${error}`)
			return false
		}
	}
}
