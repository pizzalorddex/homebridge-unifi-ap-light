import type { AxiosInstance, AxiosResponse } from 'axios'
import type { Logger } from 'homebridge'
import type { UnifiDevice } from '../models/unifiTypes.js'

export enum UnifiApiType {
	SelfHosted = 'self-hosted',
	UnifiOS = 'unifi-os',
}

/** Selects the endpoints used by self-hosted and UniFi OS controllers. */
export class UnifiApiHelper {
	private apiType: UnifiApiType | null = null
	private authenticationResponse: AxiosResponse | null = null

	async detectApiType(instance: AxiosInstance, username: string, password: string, log: Logger): Promise<UnifiApiType> {
		try {
			log.debug('[API] Trying UniFi OS authentication... [endpoint: /api/auth/login]')
			this.authenticationResponse = await instance.post('/api/auth/login', { username, password, rememberMe: true })
			this.apiType = UnifiApiType.UnifiOS
			log.debug('[API] Detected UniFi OS API structure.')
			return this.apiType
		} catch {
			try {
				log.debug('[API] Trying self-hosted authentication... [endpoint: /api/login]')
				this.authenticationResponse = await instance.post('/api/login', { username, password })
				this.apiType = UnifiApiType.SelfHosted
				log.debug('[API] Detected self-hosted API structure.')
				return this.apiType
			} catch (err) {
				log.error('[API] Failed to detect UniFi API structure (tried /api/auth/login and /api/login):', err)
				throw new Error('Unable to detect UniFi API structure.')
			}
		}
	}

	// Reuse the detection response so the controller does not see two immediate logins.
	takeAuthenticationResponse(): AxiosResponse | null {
		const response = this.authenticationResponse
		this.authenticationResponse = null
		return response
	}

	setApiType(type: UnifiApiType): void {
		this.apiType = type
	}

	getApiType(): UnifiApiType | null {
		return this.apiType
	}

	getDeviceListEndpoint(site: string): string {
		if (this.apiType === UnifiApiType.UnifiOS) {
			return `/proxy/network/api/s/${site}/stat/device`
		} else {
			return `/api/s/${site}/stat/device`
		}
	}

	getDeviceUpdateEndpoint(site: string, deviceId: string): string {
		if (this.apiType === UnifiApiType.UnifiOS) {
			return `/proxy/network/api/s/${site}/rest/device/${deviceId}`
		} else {
			return `/api/s/${site}/rest/device/${deviceId}`
		}
	}

	getSitesEndpoint(): string {
		if (this.apiType === UnifiApiType.UnifiOS) {
			return '/proxy/network/api/self/sites'
		} else {
			return '/api/self/sites'
		}
	}

	getSingleDeviceEndpoint(site: string, mac: string): string {
		if (this.apiType === UnifiApiType.UnifiOS) {
			return `/proxy/network/api/s/${site}/stat/device/${mac}`
		} else {
			return `/api/s/${site}/stat/device/${mac}`
		}
	}

	/** Returns whether the controller reports a device as online. */
	static isDeviceReady(device: UnifiDevice): boolean {
		if (typeof device.last_seen === 'number' && typeof device.uptime === 'number') {
			if (device.last_seen > 0 && device.uptime > 0) {
				return true
			}
			return false
		}
		if (device.state === 1) {
			return true
		}
		return false
	}
}
