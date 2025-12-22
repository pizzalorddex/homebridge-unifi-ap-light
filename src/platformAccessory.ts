import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import { AxiosError, AxiosResponse } from 'axios'

import { UnifiAPLight } from './platform.js'
import {getAccessPoint, isRgb, isUdm} from './unifi.js'
import {HsvDeviceState, RgbDeviceState} from './rgb.js'
import {hexToRgb, toInt} from './utils.js'
import {CHARACTERISTIC_UPDATE_DELAY} from './settings.js'

/**
 * This class represents a single platform accessory (e.g., a UniFi access point) for Homebridge.
 * It handles the lifecycle and HomeKit interactions for individual accessories.
 */
export class UniFiAP {
	// The underlying device object containing details like serial number and model
	accessPoint: any
	private service: Service

	private states: HsvDeviceState = new HsvDeviceState(false, 0, 0, 0)

	constructor(
		private readonly platform: UnifiAPLight,
		private readonly accessory: PlatformAccessory,
	) {
		this.accessPoint = this.accessory.context.accessPoint

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

		// if this AP can be different colors, register the color characteristics
		if (isRgb(this.accessPoint)) {
			// register handlers for the On/Off Characteristic
			this.service.getCharacteristic(this.platform.Characteristic.On)
				.onSet(this.setOn.bind(this))
				.onGet(this.getOn.bind(this))

			// register handlers for the Hue Characteristic
			this.service.getCharacteristic(this.platform.Characteristic.Hue)
				.onSet(this.setHue.bind(this))
				.onGet(this.getHue.bind(this))

			// register handlers for the Saturation Characteristic
			this.service.getCharacteristic(this.platform.Characteristic.Saturation)
				.onSet(this.setSaturation.bind(this))
				.onGet(this.getSaturation.bind(this))

			// register handlers for the Brightness Characteristic
			this.service.getCharacteristic(this.platform.Characteristic.Brightness)
				.onSet(this.setBrightness.bind(this))
				.onGet(this.getBrightness.bind(this))
		}
	}

	// Handles "GET" requests from HomeKit. In all the get* function, we only update the value we're explicitly getting.

	async getOn(): Promise<CharacteristicValue> {
		const apStatus = await this.getApStatus()
		this.states.isOn = apStatus.isOn
		this.platform.log.debug(`Get Characteristic On -> ${apStatus.isOn} (${this.accessPoint.name})`)
		return apStatus.isOn
	}

	async getHue(): Promise<CharacteristicValue> {
		const apStatus = await this.getApStatus()
		const hue = apStatus.hue
		this.states.Hue = hue
		this.platform.log.debug(`Get Characteristic Hue -> ${hue} (${this.accessPoint.name})`)
		return hue
	}

	async getSaturation(): Promise<CharacteristicValue> {
		const apStatus = await this.getApStatus()
		const saturation = apStatus.saturation
		this.states.Saturation = saturation
		this.platform.log.debug(`Get Characteristic Saturation -> ${saturation} (${this.accessPoint.name})`)
		return saturation
	}

	async getBrightness(): Promise<CharacteristicValue> {
		const apStatus = await this.getApStatus()
		this.states.Brightness = apStatus.Brightness
		this.platform.log.debug(`Get Characteristic Brightness -> ${apStatus.Brightness} (${this.accessPoint.name})`)
		return apStatus.Brightness
	}

	// Handles "SET" requests from HomeKit to change the state of the accessory. All four values are always updated together.

	async setOn(value: CharacteristicValue) {
		this.states.isOn = value as boolean
		await this.updateAp()
		this.platform.log.debug(`Set Characteristic On -> ${value} (${this.accessPoint.name})`)
	}

	async setHue(value: CharacteristicValue) {
		this.states.Hue = value as number
		await this.updateAp()
		this.platform.log.debug(`Set Characteristic Hue -> ${value} (${this.accessPoint.name})`)
	}

	async setSaturation(value: CharacteristicValue) {
		this.states.Saturation = value as number
		await this.updateAp()
		this.platform.log.debug(`Set Characteristic Saturation -> ${value} (${this.accessPoint.name})`)
	}

	async setBrightness(value: CharacteristicValue) {
		this.states.Brightness = value as number
		await this.updateAp()
		this.platform.log.debug(`Set Characteristic Brightness -> ${value} (${this.accessPoint.name})`)
	}

	async updateAp() {
		// wait for race conditions setting multiple characteristics
		await new Promise(resolve => setTimeout(() => resolve(0), CHARACTERISTIC_UPDATE_DELAY))

		const site = this.accessPoint.site ?? 'default'

		// convert the HSV state into the Unifi-style state
		const newState: RgbDeviceState = this.states.toRgbState()

		// Choose the correct API payload based on device type
		const data = isUdm(this.accessPoint)
			? { ledSettings: { enabled: newState.isOn } }
			: !isRgb(this.accessPoint)
				? { led_override: newState.isOn ? 'on' : 'off' }
				: {
					led_override: newState.isOn ? 'on' : 'off',
					led_override_color: newState.hex,
					led_override_color_brightness: newState.Brightness
				}

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
					this.platform.log.debug(`Successfully set LED state for ${this.accessPoint.name} to ${data.led_override}.`)
					if (isRgb(this.accessPoint)) {
						this.platform.log.debug(`Successfully set LED color for ${this.accessPoint.name} to ${data.led_override_color}.`)
						this.platform.log.debug(`Successfully set LED brightness for ${this.accessPoint.name} to ${data.led_override_color_brightness}.`)
					}
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
	 * Checks the AP for its state.
	 * @returns {Promise<RgbDeviceState>} - The current state of the AP.
	 */
	async getApStatus(): Promise<RgbDeviceState> {
		const apStatus = new RgbDeviceState(false, 0, 0, 0, 0)

		// Use the site name already attached to the AP context
		const site = this.accessPoint.site
		if (!site) {
			this.platform.log.error(`Access point ${this.accessPoint.name} is missing site information.`)
			return apStatus
		}

		try {
			// Re-fetch the latest AP state using the current site
			const accessPoint = await getAccessPoint(
				this.accessPoint._id,
				this.platform.sessionManager.request.bind(this.platform.sessionManager),
				[site],
				this.platform.log
			)

			// Process valid AP response
			if (accessPoint) {
				if (isUdm(accessPoint.type)) {
					// UDM devices use nested `ledSettings.enabled`
					if (accessPoint.ledSettings) {
						if (typeof accessPoint.ledSettings.enabled !== 'undefined') {
							const isOn = accessPoint.ledSettings.enabled
							this.platform.log.debug(`Retrieved LED state for ${this.accessPoint.name}: ${isOn ? 'on' : 'off'}`)
							apStatus.isOn = isOn
						} else {
							this.platform.log.error(`The 'enabled' property in 'ledSettings' is undefined for ${this.accessPoint.name}`)
						}
					} else {
						this.platform.log.error(`The 'ledSettings' property is undefined for ${this.accessPoint.name}`)
					}
				} else {
					// Standard APs use the flat `led_override` field
					this.platform.log.debug(`Retrieved LED state for ${this.accessPoint.name}: ${accessPoint.led_override}`)

					const isOn = accessPoint.led_override === 'on'
					apStatus.isOn = isOn
				}

				// handle color information
				if (isRgb(accessPoint)) {
					this.platform.log.debug(`Retrieved LED color for ${this.accessPoint.name}: ${accessPoint.led_override_color}`)

					const rgb = hexToRgb(accessPoint.led_override_color)
					apStatus.R = rgb[0]
					apStatus.G = rgb[1]
					apStatus.B = rgb[2]

					this.platform.log.debug(`Retrieved LED brightness for ${this.accessPoint.name}: ${accessPoint.led_override_color_brightness}`)
					apStatus.Brightness = toInt(accessPoint.led_override_color_brightness)
				}
			} else {
				this.platform.log.error(`Failed to retrieve LED information for ${this.accessPoint.name}: Access point not found`)
			}
		} catch (error) {
			// Handle network or API errors gracefully
			this.platform.log.error(`Failed to retrieve LED information for ${this.accessPoint.name}: ${error}`)
		}

		return apStatus
	}
}
