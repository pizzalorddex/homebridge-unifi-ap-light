import { Logger } from 'homebridge'
import Axios, { AxiosInstance, AxiosError } from 'axios'
import jwt from 'jsonwebtoken'
import https from 'https'
import cookie from 'cookie'

/**
 * Manages authentication sessions and re-authentication.
 */
export class SessionManager {
	private axiosInstance: AxiosInstance
	private host: string
	private username: string
	private password: string
	private log: Logger
	private siteMap: Map<string, string> = new Map()

	constructor(host: string, username: string, password: string, log: Logger) {
		this.host = host
		this.username = username
		this.password = password
		this.log = log

		// Initialize Axios instance with baseURL
		this.axiosInstance = Axios.create({
			baseURL: `https://${host}`,
			httpsAgent: new https.Agent({ rejectUnauthorized: false }),
		})
	}

	/**
   * Attempts to authenticate using the primary method, with a fallback to the secondary method upon failure.
   */
	async authenticate() {
		try {
			await this.primaryAuthMethod()
		} catch (error) {
			this.log.debug('Primary authentication method failed, attempting secondary.')
			try {
				await this.secondaryAuthMethod()
			} catch (fallbackError) {
				this.log.error(`Both authentication methods failed: ${fallbackError}`)
				throw fallbackError
			}
		}

		// Fetch site list after successful authentication
		await this.loadSites()
	}

	private async primaryAuthMethod() {
		const response = await this.axiosInstance.post('/api/login', {
			username: this.username,
			password: this.password,
		})

		if (response.headers['set-cookie']) {
			this.axiosInstance.defaults.headers['Cookie'] = response.headers['set-cookie'].join('; ')
			this.log.debug('Authentication with primary method successful.')
		} else {
			throw new Error('Primary authentication method failed: No cookies found.')
		}
	}

	private async secondaryAuthMethod() {
		const { headers } = await this.axiosInstance.post('/api/auth/login', {
			username: this.username,
			password: this.password,
			rememberMe: true,
		})

		if (!headers['set-cookie']) {
			throw new Error('Secondary authentication method failed: No cookies found.')
		}

		const cookies = cookie.parse(headers['set-cookie'].join('; '))
		const token = cookies['TOKEN']
		const decoded = jwt.decode(token) as any
		const csrfToken = decoded ? decoded.csrfToken : null

		if (!csrfToken) {
			throw new Error('Secondary authentication method failed: CSRF token not found.')
		}

		// Assuming CSRF token needs to be sent as a header for subsequent requests
		this.axiosInstance.defaults.headers['X-Csrf-Token'] = csrfToken
		// Append TOKEN cookie
		this.axiosInstance.defaults.headers['Cookie'] += `; TOKEN=${token}`

		this.log.debug('Authentication with secondary method successful.')
	}

	/**
   * Handles API requests, automatically re-authenticating if necessary.
   */
	async request(config) {
		try {
			return await this.axiosInstance(config)
		} catch (error) {
			const axiosError = error as AxiosError
			if (axiosError.response && axiosError.response.status === 401) {
				this.log.debug('Session expired, attempting to re-authenticate...')
				await this.authenticate()
				// Retry the request after re-authentication
				return await this.axiosInstance(config)
			} else {
				throw axiosError
			}
		}
	}

	/**
   * Loads and stores the list of available sites by friendly name and internal name.
   */
	private async loadSites() {
		try {
			const response = await this.request({ url: '/proxy/network/api/self/sites', method: 'get' })
			const sites = response?.data?.data
			if (Array.isArray(sites)) {
				for (const site of sites) {
					if (site.desc) {
						this.siteMap.set(site.desc, site.name)
					}
					if (site.name) {
						this.siteMap.set(site.name, site.name)
					}
				}
				this.log.debug(`All available UniFi sites: ${Array.from(this.siteMap.keys()).join(', ')}`)
			} else {
				throw new Error('Unexpected site data format')
			}
		} catch (error) {
			this.log.error(`Failed to load site list: ${error}`)
			throw error
		}
	}

	/**
   * Resolves a user-friendly site name (from config) to the internal API site name.
   * @param friendlyName The user-specified site name
   */
	getSiteName(friendlyName: string): string | undefined {
		const internalName = this.siteMap.get(friendlyName)
		if (!internalName) {
			this.log.warn(
				`Configured site "${friendlyName}" not recognized. Available: ${this.getAvailableSitePairs().join(', ')}`
			)
		}
		return internalName
	}

	/**
 * Returns all available sites as user-visible "desc (name)" pairs.
 */
	getAvailableSitePairs(): string[] {
		const seen = new Set<string>()
		const pairs: string[] = []
  
		// Reverse-lookup: build from desc → name entries
		for (const [key, value] of this.siteMap.entries()) {
			if (key !== value && !seen.has(value)) {
				pairs.push(`${key} (${value})`)
				seen.add(value)
			}
		}
  
		return pairs
	}
}
