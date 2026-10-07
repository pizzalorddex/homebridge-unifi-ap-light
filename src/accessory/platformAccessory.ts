import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import { UnifiDevice } from '../models/unifiTypes.js'
import { markAccessoryNotResponding, errorHandler } from '../utils/errorHandler.js'
import type { UnifiAPLight } from '../platform.js'

/** Exposes one UniFi access point light to HomeKit. */
export class UniFiAP {
	accessPoint: UnifiDevice
	private service: Service

	constructor(
		private readonly platform: UnifiAPLight,
		private readonly accessory: PlatformAccessory,
	) {
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

		this.service =
			this.accessory.getService(this.platform.Service.Lightbulb) ||
			this.accessory.addService(this.platform.Service.Lightbulb)

		this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessPoint.name)

		this.service.getCharacteristic(this.platform.Characteristic.On)
			.onSet(this.setOn.bind(this))
			.onGet(this.getOn.bind(this))

		// A successful refresh must also clear a previous HomeKit error status.
		const stateRecord = this.platform.getDeviceCache().getDeviceById(this.accessPoint._id)
		void this.getOn().then(state => {
			if (!this.platform.isShuttingDown && stateRecord && this.platform.getDeviceCache().getDeviceById(this.accessPoint._id) === stateRecord) {
				this.service.updateCharacteristic(this.platform.Characteristic.On, state)
			}
		}).catch(() => {})
	}

	private async currentDevice(): Promise<UnifiDevice> {
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
