import { UnifiDevice } from '../models/unifiTypes.js'
import { errorHandler } from '../utils/errorHandler.js'
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

	static async refreshDeviceCache(platform: UnifiAPLight): Promise<void> {
		try {
			const siteInput = platform.config.sites?.length ? platform.config.sites : ['default']
			const resolveSites = (): string[] => siteInput
				.map(site => platform.sessionManager.getSiteName(site))
				.filter((site): site is string => Boolean(site))
			let resolvedSites = resolveSites()
			// UniFi OS can report ready before the Network application is ready.
			// If startup site discovery failed during that window, retry a fresh
			// login here so the periodic refresh can recover without a restart.
			if (!resolvedSites.length) {
				await platform.sessionManager.authenticate()
				resolvedSites = resolveSites()
			}
			if (!resolvedSites.length) {
				errorHandler(platform.log, { name: 'CacheRefreshError', message: 'No valid sites resolved. Aborting device cache refresh.' }, { endpoint: 'refreshDeviceCache' })
				return
			}
			let accessPoints = []
			try {
				const { getAccessPoints } = await import('../unifi.js')
				accessPoints = await getAccessPoints(
					platform.sessionManager.request.bind(platform.sessionManager),
					platform.sessionManager.getApiHelper(),
					resolvedSites,
					platform.log
				)
			} catch (err) {
				errorHandler(platform.log, { name: 'CacheRefreshWarn', message: 'Device cache refresh failed, attempting re-authentication', error: err instanceof Error ? err.message : String(err) }, { endpoint: 'refreshDeviceCache' })
				await platform.sessionManager.authenticate()
				const { getAccessPoints } = await import('../unifi.js')
				accessPoints = await getAccessPoints(
					platform.sessionManager.request.bind(platform.sessionManager),
					platform.sessionManager.getApiHelper(),
					resolvedSites,
					platform.log
				)
			}
			platform.getDeviceCache().setDevices(accessPoints)
			platform.log.debug(`[Cache Refresh] Device cache refreshed. ${accessPoints.length} devices currently available.`)
		} catch (err) {
			const { UnifiAuthError, UnifiApiError, UnifiNetworkError } = await import('../models/unifiTypes.js')
			if (err instanceof UnifiAuthError) {
				errorHandler(platform.log, { name: 'CacheRefreshError', message: 'Device cache refresh failed: Failed to detect UniFi API structure during authentication' }, { endpoint: 'refreshDeviceCache' })
			} else if (err instanceof UnifiApiError || err instanceof UnifiNetworkError) {
				errorHandler(platform.log, { name: 'CacheRefreshError', message: 'Device cache refresh failed', error: err instanceof Error ? err.message : String(err) }, { endpoint: 'refreshDeviceCache' })
			} else if (err instanceof Error) {
				errorHandler(platform.log, { name: 'CacheRefreshError', message: 'Device cache refresh failed', error: err.message }, { endpoint: 'refreshDeviceCache' })
			} else if (typeof err === 'string') {
				errorHandler(platform.log, { name: 'CacheRefreshError', message: 'Device cache refresh failed', error: err }, { endpoint: 'refreshDeviceCache' })
			} else {
				errorHandler(platform.log, { name: 'CacheRefreshError', message: 'Device cache refresh failed', error: JSON.stringify(err) }, { endpoint: 'refreshDeviceCache' })
			}
			const { markAccessoryNotResponding } = await import('../utils/errorHandler.js')
			for (const accessory of platform.accessories) {
				markAccessoryNotResponding(platform, accessory)
			}
			platform.getDeviceCache().clear()
		}
	}
}
