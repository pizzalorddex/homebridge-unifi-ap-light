import { UnifiDevice } from '../models/unifiTypes.js'
import type { UnifiAPLight } from '../platform.js'

export class DeviceCache {
	private devices: Map<string, UnifiDevice> = new Map()

	setDevices(devices: UnifiDevice[]): void {
		this.devices.clear()
		for (const device of devices) {
			this.devices.set(device._id, device)
		}
	}

	getDeviceById(id: string): UnifiDevice | undefined {
		return this.devices.get(id)
	}

	getAllDevices(): UnifiDevice[] {
		return Array.from(this.devices.values())
	}

	clear(): void {
		this.devices.clear()
	}

	setDevice(device: UnifiDevice): void {
		this.devices.set(device._id, device)
	}

	removeDevice(id: string): void {
		this.devices.delete(id)
	}

	static async refreshDeviceCache(platform: UnifiAPLight): Promise<void> {
		const { discoverDevices } = await import('../platform/discovery.js')
		await discoverDevices(platform, false)
	}
}
