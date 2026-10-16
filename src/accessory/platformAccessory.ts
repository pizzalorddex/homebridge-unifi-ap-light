import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import { UnifiDevice } from '../models/unifiTypes.js'
import { markAccessoryNotResponding, errorHandler } from '../utils/errorHandler.js'
import type { UnifiAPLight } from '../platform.js'
import { hasBrightnessLedCapability, hasRgbLedCapability } from './ledCapabilities.js'
import { hexToHueSaturation, hueSaturationToHex, parseLedBrightness } from './ledColor.js'
import { LedUpdateQueue, type LedChanges } from './ledUpdateQueue.js'

/** Exposes one UniFi access point light to HomeKit. */
export class UniFiAP {
	accessPoint!: UnifiDevice
	private service: Service
	private stopped = false
	private rgbEnabled = false
	private brightnessEnabled = false
	private capabilitySignature?: string
	private generation = 0
	private ledUpdates = new LedUpdateQueue(changes => this.writeLedChanges(changes))

	constructor(
		private readonly platform: UnifiAPLight,
		private readonly accessory: PlatformAccessory,
	) {
		this.service =
			this.accessory.getService(this.platform.Service.Lightbulb) ||
			this.accessory.addService(this.platform.Service.Lightbulb)
		this.refresh()
	}

	refresh(): void {
		if (this.stopped) {
			return
		}
		const cached = this.platform.getDeviceCache().getDeviceById(this.accessory.context.accessPoint._id)
		this.accessPoint = cached || this.accessory.context.accessPoint

		// Older cached accessories may not have a site.
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


		this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessPoint.name)
		this.configureLedControls()

		this.service.getCharacteristic(this.platform.Characteristic.On)
			.onSet(this.setOn.bind(this))
			.onGet(this.getOn.bind(this))

		// A successful refresh must also clear a previous HomeKit error status.
		const readGeneration = this.generation
		const stateRecord = this.platform.getDeviceCache().getDeviceById(this.accessPoint._id)
		void this.getOn().then(state => {
			const latest = this.platform.getDeviceCache().getDeviceById(this.accessPoint._id)
			const unchangedOn = this.brightnessEnabled && latest?.site === stateRecord?.site &&
				latest?.led_override === stateRecord?.led_override && latest?.ledSettings?.enabled === stateRecord?.ledSettings?.enabled
			if (!this.stopped && !this.platform.isShuttingDown && readGeneration === this.generation && stateRecord &&
				(latest === stateRecord || unchangedOn)) {
				this.service.updateCharacteristic(this.platform.Characteristic.On, state)
			}
		}).catch(() => {})
	}

	shutdown(): void {
		this.stopped = true
		this.generation++
		this.ledUpdates.close()
	}

	private async currentDevice(): Promise<UnifiDevice> {
		if (this.stopped || this.platform.isShuttingDown) {
			throw new Error('LED updates stopped')
		}
		let device = this.platform.getDeviceCache().getDeviceById(this.accessPoint._id)
		if (!device) {
			await this.platform.forceImmediateCacheRefresh()
			device = this.platform.getDeviceCache().getDeviceById(this.accessPoint._id)
		}
		if (!device) {
			throw new Error('Device not found in cache')
		}
		return device
	}

	async setOn(value: CharacteristicValue): Promise<void> {
		if (this.brightnessEnabled) {
			return this.setLed({ on: Boolean(value) })
		}
		try {
			const device = await this.currentDevice()
			const site = device.site ?? 'default'
			const enabled = Boolean(value)
			const data = device.type === 'udm'
				? { ledSettings: { enabled } }
				: { led_override: enabled ? 'on' : 'off' }
			const endpoint = this.platform.sessionManager.getApiHelper().getDeviceUpdateEndpoint(site, device._id)
			const response = await this.platform.sessionManager.request({ method: 'put', url: endpoint, data })
			if (response.status !== 200 || response.data?.meta?.rc !== 'ok') {
				throw new Error('Controller did not accept the LED update')
			}
			// A refresh may finish while the write is in flight. Preserve its metadata.
			const latest = this.platform.getDeviceCache().getDeviceById(device._id)
			if (latest && latest.site === device.site) {
				this.accessPoint = latest.type === 'udm'
					? { ...latest, ledSettings: { ...latest.ledSettings, enabled } }
					: { ...latest, led_override: enabled ? 'on' : 'off' }
				this.platform.getDeviceCache().setDevice(this.accessPoint)
			}
			this.platform.log.debug(`[Accessory] Controller accepted LED update for ${device.name}.`)
		} catch (error) {
			errorHandler(this.platform.log, error, { endpoint: 'setOn' })
			markAccessoryNotResponding(this.platform, this.accessory)
			this.platform.getDeviceCache().removeDevice(this.accessPoint._id)
			throw new Error('Not Responding')
		}
	}

	private configureLedControls(): void {
		const device = this.accessPoint
		const signature = JSON.stringify([device.type, device.model, device.version, device.hw_caps, device.site, this.platform.config.enableRgb === true, this.platform.config.enableBrightness === true])
		// Reconsider capability only when normal discovery supplies changed evidence.
		if (signature !== this.capabilitySignature) {
			this.capabilitySignature = signature
			this.generation++
			this.ledUpdates.close()
			this.ledUpdates = new LedUpdateQueue(changes => this.writeLedChanges(changes))
			this.rgbEnabled = this.platform.config.enableRgb === true && hasRgbLedCapability(device)
			this.brightnessEnabled = this.rgbEnabled || (this.platform.config.enableBrightness === true && hasBrightnessLedCapability(device))
		}
		const controls = [
			{ type: this.platform.Characteristic.Hue, enabled: this.rgbEnabled, get: () => this.getHue(), set: (value: CharacteristicValue) => this.setHue(value) },
			{ type: this.platform.Characteristic.Saturation, enabled: this.rgbEnabled, get: () => this.getSaturation(), set: (value: CharacteristicValue) => this.setSaturation(value) },
			{ type: this.platform.Characteristic.Brightness, enabled: this.brightnessEnabled, get: () => this.getBrightness(), set: (value: CharacteristicValue) => this.setBrightness(value) },
		]
		for (const control of controls) {
			if (control.enabled) {
				this.service.getCharacteristic(control.type).onGet(control.get).onSet(control.set)
			} else if (this.service.testCharacteristic?.(control.type)) {
				this.service.removeCharacteristic(this.service.getCharacteristic(control.type))
			}
		}
		if (!this.ledUpdates.busy) {
			this.syncLedCharacteristics(device)
		}
	}

	private syncLedCharacteristics(device: UnifiDevice): void {
		if (this.rgbEnabled) {
			try {
				const colour = hexToHueSaturation(device.led_override_color)
				this.service.updateCharacteristic(this.platform.Characteristic.Hue, colour.hue)
				this.service.updateCharacteristic(this.platform.Characteristic.Saturation, colour.saturation)
			} catch {
				this.service.updateCharacteristic(this.platform.Characteristic.Hue, new Error('Not Responding'))
				this.service.updateCharacteristic(this.platform.Characteristic.Saturation, new Error('Not Responding'))
			}
		}
		if (this.brightnessEnabled) {
			try {
				this.service.updateCharacteristic(this.platform.Characteristic.Brightness, parseLedBrightness(device.led_override_color_brightness))
			} catch {
				this.service.updateCharacteristic(this.platform.Characteristic.Brightness, new Error('Not Responding'))
			}
		}
	}

	async getHue(): Promise<CharacteristicValue> {
		return this.getLedValue('hue')
	}

	async getSaturation(): Promise<CharacteristicValue> {
		return this.getLedValue('saturation')
	}

	async getBrightness(): Promise<CharacteristicValue> {
		return this.getLedValue('brightness')
	}

	private async getLedValue(component: 'hue' | 'saturation' | 'brightness'): Promise<number> {
		try {
			const device = await this.currentDevice()
			if (!(component === 'brightness' ? this.brightnessEnabled : this.rgbEnabled)) {
				throw new Error('LED control is unavailable')
			}
			return component === 'brightness' ? parseLedBrightness(device.led_override_color_brightness) : hexToHueSaturation(device.led_override_color)[component]
		} catch (error) {
			errorHandler(this.platform.log, error, { endpoint: 'getLedState' })
			throw new Error('Not Responding')
		}
	}

	async setHue(value: CharacteristicValue): Promise<void> {
		hueSaturationToHex(value, 100)
		return this.setLed({ hue: value as number })
	}

	async setSaturation(value: CharacteristicValue): Promise<void> {
		hueSaturationToHex(0, value)
		return this.setLed({ saturation: value as number })
	}

	async setBrightness(value: CharacteristicValue): Promise<void> {
		if (typeof value !== 'number') {
			throw new Error('Invalid LED brightness')
		}
		return this.setLed({ brightness: parseLedBrightness(value) })
	}

	private canApplyChanges(changes: LedChanges): boolean {
		return this.brightnessEnabled &&
			((changes.hue === undefined && changes.saturation === undefined) || this.rgbEnabled)
	}

	private async setLed(changes: LedChanges): Promise<void> {
		const generation = this.generation
		if (!this.canApplyChanges(changes) || this.stopped || this.platform.isShuttingDown) {
			throw new Error('Not Responding')
		}
		try {
			await this.ledUpdates.update(changes)
		} catch (error) {
			if (generation === this.generation && !this.stopped) {
				errorHandler(this.platform.log, error, { endpoint: 'setLedState' })
				markAccessoryNotResponding(this.platform, this.accessory)
				this.platform.getDeviceCache().removeDevice(this.accessPoint._id)
			}
			throw new Error('Not Responding')
		}
	}

	private async writeLedChanges(changes: LedChanges): Promise<void> {
		const generation = this.generation
		const device = await this.currentDevice()
		if (generation !== this.generation || !this.canApplyChanges(changes) || this.stopped || this.platform.isShuttingDown) {
			throw new Error('LED control is unavailable')
		}
		const data: Partial<Pick<UnifiDevice, 'led_override' | 'led_override_color' | 'led_override_color_brightness'>> = {}
		if (changes.on !== undefined) {
			data.led_override = changes.on ? 'on' : 'off'
		}
		if (changes.hue !== undefined || changes.saturation !== undefined) {
			const colour = changes.hue === undefined || changes.saturation === undefined ? hexToHueSaturation(device.led_override_color) : changes
			data.led_override_color = hueSaturationToHex(changes.hue ?? colour.hue, changes.saturation ?? colour.saturation)
		}
		if (changes.brightness !== undefined) {
			data.led_override_color_brightness = changes.brightness
		}
		const endpoint = this.platform.sessionManager.getApiHelper().getDeviceUpdateEndpoint(device.site ?? 'default', device._id)
		const response = await this.platform.sessionManager.request({ method: 'put', url: endpoint, data })
		if (response.status !== 200 || response.data?.meta?.rc !== 'ok') {
			throw new Error('Controller did not accept the LED update')
		}
		if (generation !== this.generation || this.stopped || this.platform.isShuttingDown) {
			return
		}
		const latest = this.platform.getDeviceCache().getDeviceById(device._id)
		if (latest && latest.site === device.site) {
			this.accessPoint = { ...latest, ...data }
			this.platform.getDeviceCache().setDevice(this.accessPoint)
			this.syncLedCharacteristics(this.accessPoint)
			const on = changes.on ?? (this.accessPoint.led_override === 'on' ? true : this.accessPoint.led_override === 'off' ? false : undefined)
			if (on !== undefined) {
				this.service.updateCharacteristic(this.platform.Characteristic.On, on)
			}
		}
	}

	async getOn(): Promise<CharacteristicValue> {
		try {
			const device = await this.currentDevice()
			if (device.type === 'udm') {
				if (typeof device.ledSettings?.enabled !== 'boolean') {
					throw new Error('LED state is unavailable')
				}
				return device.ledSettings.enabled
			}
			if (device.led_override === 'on') {
				return true
			}
			if (device.led_override === 'off') {
				return false
			}
			if (device.led_override === 'default' || device.led_override === undefined) {
				return await this.platform.sessionManager.getSiteLedEnabled(device.site ?? 'default')
			}
			throw new Error('LED state is unavailable')
		} catch (error) {
			errorHandler(this.platform.log, error, { endpoint: 'getOn' })
			markAccessoryNotResponding(this.platform, this.accessory)
			throw new Error('Not Responding')
		}
	}
}
