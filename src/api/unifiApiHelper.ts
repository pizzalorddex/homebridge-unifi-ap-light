import { errorHandler } from '../utils/errorHandler.js'
import type { AxiosInstance, AxiosResponse } from 'axios'
import type { Logger } from 'homebridge'
import { UnifiAuthError, type UnifiDevice } from '../models/unifiTypes.js'

export enum UnifiApiType {
	SelfHosted = 'self-hosted',
	UnifiOS = 'unifi-os',
}

/** Selects the endpoints used by self-hosted and UniFi OS controllers. */
export class UnifiApiHelper {
	private apiType: UnifiApiType | null = null
	private authenticationResponse: AxiosResponse | null = null

	async detectApiType(instance: AxiosInstance, username: string, password: string, log: Logger): Promise<UnifiApiType> {
		this.authenticationResponse = null
		try {
			let type = UnifiApiType.UnifiOS
			try {
				this.authenticationResponse = await this.login(instance, type, username, password, log)
			} catch (error) {
				// Only a client response can suggest the older authentication route.
				// Throttling, an unavailable controller and transport faults cannot.
				const status = (error as { status?: number }).status
				if (!status || status < 400 || status >= 500 || status === 429) {
					throw error
				}
				type = UnifiApiType.SelfHosted
				this.authenticationResponse = await this.login(instance, type, username, password, log)
			}
			this.apiType = type
			log.debug(`[API] Detected ${type} API structure.`)
			return type
		} catch (error) {
			errorHandler(log, error)
			throw error
		}
	}

	/** One bounded retry for controller login throttling; never retry passwords on 401. */
	async login(instance: AxiosInstance, type: UnifiApiType, username: string, password: string, log: Logger): Promise<AxiosResponse> {
		const endpoint = type === UnifiApiType.UnifiOS ? '/api/auth/login' : '/api/login'
		const body = type === UnifiApiType.UnifiOS ? { username, password, rememberMe: true } : { username, password }
		for (let attempt = 0; ; attempt++) {
			try {
				return await instance.post(endpoint, body)
			} catch (error) {
				const details = error as { response?: { status?: number; headers?: Record<string, unknown> }; code?: string }
				const rawStatus = details?.response?.status
				const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined
				if (status === 429 && attempt === 0) {
					const header = details.response?.headers?.['retry-after']
					const value = typeof header === 'string' || typeof header === 'number' ? String(header) : ''
					const seconds = value.trim() === '' ? 5 : /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000
					const delay = Number.isFinite(seconds) ? Math.max(1, seconds) : 5
					// Longer server-requested delays are deferred to normal recovery.
					if (delay <= 30) {
						log.warn(`[API] Controller login rate-limited (HTTP 429); retrying in ${Math.ceil(delay)} seconds.`)
						await new Promise(resolve => setTimeout(resolve, Math.ceil(delay * 1000)))
						continue
					}
				}
				const codes = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ECONNABORTED', 'ETIMEDOUT',
					'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID']
				const reason = status ? `HTTP ${status}`
					: codes.includes(details?.code ?? '') ? details.code : 'transport failure'
				// Do not retain Axios errors: they contain credentials and session cookies.
				const failure = new UnifiAuthError(`Login failed at ${type} endpoint (${reason}).`) as UnifiAuthError & { status?: number }
				failure.status = status
				throw failure
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

	getSettingsEndpoint(site: string): string {
		const prefix = this.apiType === UnifiApiType.UnifiOS ? '/proxy/network' : ''
		return `${prefix}/api/s/${site}/get/setting`
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
		if (typeof device.state === 'number') {
			return device.state === 1
		}
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
