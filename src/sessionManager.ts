import { Logger } from 'homebridge'
import Axios, { AxiosInstance, AxiosError } from 'axios'
import jwt from 'jsonwebtoken'
import https from 'https'
import { parse as parseCookie } from 'cookie'

/**
 * Manages authentication sessions and re-authentication.
 */
export class SessionManager {
	private axiosInstance: AxiosInstance | null = null
	private host: string
	private username: string
	private password: string
	private log: Logger
	private siteMap: Map<string, string> = new Map()
	private isUniFiOS = false

	constructor(host: string, username: string, password: string, log: Logger) {
		this.host = host
		this.username = username
		this.password = password
		this.log = log
	}

	/**
	 * Authenticates using both methods in parallel, and adopts the first one that succeeds.
	 */
	async authenticate() {
		this.log.debug('Starting parallel authentication attempts...')

		const primaryAttempt = this.tryPrimaryAuth()
		const secondaryAttempt = this.trySecondaryAuth()

		try {
			const { instance, isUniFiOS } = await Promise.any([primaryAttempt, secondaryAttempt])

			// Assign the working Axios instance and detected mode
			this.axiosInstance = instance
			this.isUniFiOS = isUniFiOS
			this.log.debug(`Authentication successful. UniFi OS mode: ${isUniFiOS}`)

			await this.loadSites()
		} catch (error) {
			this.log.error(`Both authentication methods failed: ${error}`)
			throw error
		}
	}

	/**
	 * Auth using /api/login for self-hosted consoles.
	 * Returns a fully-configured Axios instance.
	 */
	private async tryPrimaryAuth(): Promise<{ instance: AxiosInstance; isUniFiOS: boolean }> {
		const instance = Axios.create({
			baseURL: `https://${this.host}`,
			httpsAgent: new https.Agent({ rejectUnauthorized: false }),
		})

		this.log.debug('Trying primary (self-hosted) authentication...')

		const response = await instance.post('/api/login', {
			username: this.username,
			password: this.password,
		})

		if (!response.headers['set-cookie']) {
			throw new Error('Primary auth failed: No cookies returned')
		}

		instance.defaults.headers.common['Cookie'] = response.headers['set-cookie'].join('; ')
		return { instance, isUniFiOS: false }
	}

	/**
	 * Auth using /api/auth/login for UniFi OS consoles.
	 * Returns a fully-configured Axios instance.
	 */
	private async trySecondaryAuth(): Promise<{ instance: AxiosInstance; isUniFiOS: boolean }> {
		const instance = Axios.create({
			baseURL: `https://${this.host}`,
			httpsAgent: new https.Agent({ rejectUnauthorized: false }),
		})

		this.log.debug('Trying secondary (UniFi OS) authentication...')

		const response = await instance.post('/api/auth/login', {
			username: this.username,
			password: this.password,
			rememberMe: true,
		})

		const setCookie = response.headers['set-cookie']
		if (!setCookie) {
			throw new Error('Secondary auth failed: No cookies returned')
		}

		let token = ''
		let csrfToken = ''

		try {
			const parsed = parseCookie(setCookie.join('; '))
			token = parsed['TOKEN'] ?? ''
			const decoded = jwt.decode(token) as any
			csrfToken = decoded?.csrfToken
		} catch (err) {
			this.log.error(`Cookie parsing or token decoding failed: ${err}`)
			throw new Error('Secondary authentication failed: Malformed cookie or token.')
		}

		if (!csrfToken) {
			throw new Error('Secondary auth failed: CSRF token not found.')
		}

		instance.defaults.headers.common['X-Csrf-Token'] = csrfToken
		instance.defaults.headers.common['Cookie'] = `${setCookie.join('; ')}; TOKEN=${token}`
		return { instance, isUniFiOS: true }
	}

	/**
	 * Handles API requests with retry on 401
	 */
	async request(config) {
		if (!this.axiosInstance) {
			throw new Error('Cannot make API request: No authenticated session.')
		}
		try {
			return await this.axiosInstance(config)
		} catch (error) {
			const axiosError = error as AxiosError
			if (axiosError.response?.status === 401) {
				this.log.warn('Session expired, retrying authentication...')
				await this.authenticate()
				return await this.axiosInstance(config)
			} else {
				throw axiosError
			}
		}
	}

	/**
	 * Load available sites from the appropriate endpoint.
	 */
	private async loadSites() {
		const url = this.isUniFiOS ? '/proxy/network/api/self/sites' : '/api/self/sites'

		try {
			const response = await this.request({ url, method: 'get' })
			const sites = response?.data?.data

			if (Array.isArray(sites)) {
				for (const site of sites) {
					if (site.desc) 
						this.siteMap.set(site.desc, site.name)
					if (site.name) 
						this.siteMap.set(site.name, site.name)
				}
				this.log.debug(`Loaded sites from ${url}: ${Array.from(this.siteMap.keys()).join(', ')}`)
			} else {
				throw new Error('Unexpected site list structure')
			}
		} catch (error) {
			this.log.error(`Failed to load site list from ${url}: ${error}`)
			throw error
		}
	}

	getSiteName(friendlyName: string): string | undefined {
		const internal = this.siteMap.get(friendlyName)
		if (!internal) {
			this.log.warn(
				`Configured site "${friendlyName}" not recognized. Available: ${this.getAvailableSitePairs().join(', ')}`
			)
		}
		return internal
	}

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
