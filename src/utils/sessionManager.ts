import { Logger } from 'homebridge'
import Axios, { AxiosInstance, AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import jwt from 'jsonwebtoken'
import https from 'https'
import { parse as parseCookie } from 'cookie'
import { UnifiApiHelper, UnifiApiType } from '../api/unifiApiHelper.js'
import { UnifiSite, UnifiApiError, UnifiAuthError, UnifiNetworkError } from '../models/unifiTypes.js'
import { errorHandler } from './errorHandler.js'

/**
 * SessionManager
 * Handles authentication, session management, and API structure detection for UniFi controllers.
 *
 * - Detects and caches API structure (self-hosted vs. UniFi OS).
 * - Handles re-authentication and robust error handling for all API requests.
 * - Throws custom error classes for different failure types.
 */
export class SessionManager {
	private axiosInstance: AxiosInstance | null = null
	private host: string
	private username: string
	private password: string
	private log: Logger
	private siteMap: Map<string, string> = new Map()
	private apiHelper: UnifiApiHelper

	constructor(host: string, username: string, password: string, log: Logger) {
		this.host = host
		this.username = username
		this.password = password
		this.log = log
		this.apiHelper = new UnifiApiHelper()
	}

	/**
	 * Authenticates with the UniFi controller, detecting API structure if needed.
	 *
	 * @returns {Promise<void>}
	 * @throws {UnifiAuthError} If authentication or API structure detection fails.
	 */
	async authenticate(): Promise<void> {
		this.log.debug(`[Session] Starting authentication for host "${this.host}"...`)
		let instance: AxiosInstance
		try {
			instance = Axios.create({
				baseURL: `https://${this.host}`,
				httpsAgent: new https.Agent({ rejectUnauthorized: false }),
			})
		} catch (err) {
			throw new UnifiAuthError('Failed to create Axios instance for authentication', err)
		}

		let apiType = this.apiHelper.getApiType()
		try {
			if (!apiType) {
				apiType = await this.apiHelper.detectApiType(instance, this.username, this.password, this.log)
			}
		} catch (err) {
			throw new UnifiAuthError('Failed to detect UniFi API structure during authentication', err)
		}

		try {
			if (apiType === UnifiApiType.UnifiOS) {
				const response = await instance.post('/api/auth/login', {
					username: this.username,
					password: this.password,
					rememberMe: true,
				})
				const setCookie = response.headers['set-cookie']
				if (!setCookie) 
					throw new UnifiAuthError('No cookies returned from UniFi OS login')
				let token = ''
				let csrfToken = ''
				try {
					const parsed = parseCookie(setCookie.join('; '))
					token = parsed['TOKEN'] ?? ''
					const decoded = jwt.decode(token) as { csrfToken?: string } | null
					csrfToken = decoded?.csrfToken ?? ''
				} catch (err) {
					errorHandler(this.log, err)
					throw new UnifiAuthError('UniFi OS authentication failed: Malformed cookie or token.', err)
				}
				if (!csrfToken) 
					throw new UnifiAuthError('CSRF token not found.')
				instance.defaults.headers.common['X-Csrf-Token'] = csrfToken
				instance.defaults.headers.common['Cookie'] = `${setCookie.join('; ')}; TOKEN=${token}`
			} else {
				const response = await instance.post('/api/login', {
					username: this.username,
					password: this.password,
				})
				if (!response.headers['set-cookie']) 
					throw new UnifiAuthError('No cookies returned from self-hosted login')
				instance.defaults.headers.common['Cookie'] = response.headers['set-cookie'].join('; ')
			}
		} catch (err) {
			throw new UnifiAuthError('Failed to authenticate with UniFi controller', err)
		}

		this.axiosInstance = instance
		this.log.debug(`[Session] Authentication successful for host "${this.host}". API type: ${apiType}`)
		await this.loadSites()
	}

	/**
	 * Makes an authenticated API request, retrying authentication on 401.
	 *
	 * @param {AxiosRequestConfig} config Axios request config object.
	 * @returns {Promise<AxiosResponse>} The API response.
	 * @throws {UnifiApiError|UnifiAuthError|UnifiNetworkError} On failure.
	 */
	async request(config: AxiosRequestConfig): Promise<AxiosResponse> {
		if (!this.axiosInstance) {
			throw new UnifiAuthError('Cannot make API request: No authenticated session.')
		}
		try {
			return await this.axiosInstance(config)
		} catch (error) {
			const axiosError = error as AxiosError
			if (axiosError.response?.status === 401) {
				this.log.debug(`[Session] Session expired for host "${this.host}", retrying authentication...`)
				await this.authenticate()
				return await this.axiosInstance(config)
			} else if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
				throw new UnifiNetworkError('Network error communicating with UniFi controller', axiosError)
			} else if (error instanceof UnifiApiError || error instanceof UnifiAuthError || error instanceof UnifiNetworkError) {
				throw error
			} else {
				throw new UnifiApiError('API request failed', axiosError)
			}
		}
	}

	/**
	 * Loads available sites from the controller using the correct endpoint for the detected API structure.
	 *
	 * @returns {Promise<void>}
	 * @throws {Error} If the site list cannot be loaded.
	 */
	private async loadSites(): Promise<void> {
		const url = this.apiHelper.getSitesEndpoint()
		this.siteMap.clear()
		try {
			const response = await this.request({ url, method: 'get' })
			const sites: UnifiSite[] = response?.data?.data
			if (Array.isArray(sites)) {
				for (const site of sites) {
					if (site && typeof site === 'object') {
						if (site.desc && site.name) {
							this.siteMap.set(site.desc, site.name)
							this.siteMap.set(site.name, site.name)
						} else if (site.name) {
							this.siteMap.set(site.name, site.name)
						}
						// If only desc is present, do not map it
					}
				}
				this.log.debug(`[Site] Loaded sites from ${url}: ${Array.from(this.siteMap.keys()).join(', ')}`)
			} else {
				throw new UnifiApiError('Unexpected site list structure', { response })
			}
		} catch (error) {
			if (error instanceof UnifiApiError) {
				errorHandler(this.log, error, { endpoint: url })
				throw error
			} else {
				errorHandler(this.log, error, { endpoint: url })
				throw new UnifiApiError('Failed to load site list', error)
			}
		}
	}

	/**
	 * Returns the API helper for endpoint resolution and structure info.
	 *
	 * @returns {UnifiApiHelper}
	 */
	getApiHelper(): UnifiApiHelper {
		return this.apiHelper
	}

	/**
	 * Resolves a friendly site name (desc) to the internal UniFi site name.
	 *
	 * @param {string} friendlyName The user-friendly site name or description.
	 * @returns {string|undefined} The internal site name, or undefined if not found.
	 */
	getSiteName(friendlyName: string): string | undefined {
		const internal = this.siteMap.get(friendlyName)
		if (!internal) {
			this.log.warn(`[Site] Configured site "${friendlyName}" not recognized. Available: ${this.getAvailableSitePairs().join(', ')}`)
		}
		return internal
	}

	/**
	 * Returns a list of available site name/desc pairs for logging and config help.
	 *
	 * @returns {string[]}
	 */
	getAvailableSitePairs(): string[] {
		const seen = new Set<string>()
		const pairs: string[] = []
		for (const [key, value] of this.siteMap.entries()) {
			if (key !== value && !seen.has(value)) {
				pairs.push(`${key} (${value})`)
				seen.add(value)
			}
		}
		return pairs
	}
}
