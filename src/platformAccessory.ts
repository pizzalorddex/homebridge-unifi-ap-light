import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import { AxiosError } from 'axios'

import { UnifiAPLight } from './platform'
import { getAccessPoint } from './unifi'

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
		// Initialize accessory information from the configuration.
		const accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)
		if (accessoryInformationService) {
			accessoryInformationService
				.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Ubuquiti')
				.setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.accessPoint.model)
				.setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.accessPoint.serial)
				.setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessory.context.accessPoint.version)
		} else {
			// Handle the case where the service is not available
			this.platform.log.warn('Accessory Information Service not found.')
		}

		// Retrieve or create a new LightBulb service for controlling device state.
		this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb)

		// Set the service name to be displayed as the default name in the Home app
		// For example, this uses the name stored in `accessory.context` from the `discoverDevices` method.
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.accessPoint.name)

		// Register handlers for the On/Off Characteristic (minimum HomeKit requirement for lights) to enable HomeKit control.
		// See https://developers.homebridge.io/#/service/Lightbulb
		this.service.getCharacteristic(this.platform.Characteristic.On)
			.onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
			.onGet(this.getOn.bind(this))               // GET - bind to the `getOn` method below
	}

	/**
	 * Handles "SET" requests from HomeKit to change the state of the accessory, such as turning a light on or off.
	 * @param {CharacteristicValue} value - The new state from HomeKit.
	 */
	async setOn(value: CharacteristicValue) {
		const data = {
			led_override: value ? 'on' : 'off',
		}
		const endpoints = [
			`/s/default/rest/device/${this.accessory.context.accessPoint._id}`,
			`/proxy/network/api/s/default/rest/device/${this.accessory.context.accessPoint._id}`
		]
	
		for (const endpoint of endpoints) {
			try {
				await this.platform.sessionManager.request({
					method: 'put',
					url: endpoint,
					data: data,
				})
				this.platform.log.debug(`Successfully set LED state for ${this.accessory.context.accessPoint.name} to ${value ? 'on' : 'off'}.`)
				return
			} catch (error) {
				const axiosError = error as AxiosError
				if (axiosError.response && axiosError.response.status === 404 && endpoint !== endpoints[endpoints.length - 1]) {
					continue // Try the next endpoint in case of a 404 error
				} else {
					this.platform.log.error(`Failed to set LED state for ${this.accessory.context.accessPoint.name}: ${error}`)
					break // Exit loop on other errors
				}
			}
		}
	}

	/**
	 * Handles "GET" requests from HomeKit to retrieve the current state of the accessory, such as whether a light is on or off.
	 * Should return ASAP to prevent an unresponsive status.
	 * @returns {Promise<CharacteristicValue>} - The current state of the accessory.
	 */
	async getOn(): Promise<CharacteristicValue> {
		try {
			const accessPoint = await getAccessPoint(this.accessory.context.accessPoint._id, this.platform.sessionManager.request.bind(this.platform.sessionManager))
			if (accessPoint) {
				const isOn = accessPoint.led_override === 'on'
				this.platform.log.debug(`Retrieved LED state for ${this.accessory.context.accessPoint.name}: ${isOn ? 'on' : 'off'}`)
				return isOn
			}
			return false
		} catch (error) {
			this.platform.log.error(`Failed to retrieve LED state for ${this.accessory.context.accessPoint.name}: ${error}`)
			return false
		}
	}
}
