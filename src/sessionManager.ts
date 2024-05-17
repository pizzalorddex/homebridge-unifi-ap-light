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
			}
		}
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

		if(!headers['set-cookie']) {
			throw new Error('Secondary authentication method failed: No cookies found.')
		}

		const cookies = cookie.parse(headers['set-cookie'].join('; '))
		const token = cookies['TOKEN']
		const decoded = jwt.decode(token)
		const csrfToken = decoded ? decoded.csrfToken : null

		if (!csrfToken) {
			throw new Error('Secondary authentication method failed: CSRF token not found.')
		}

		// Assuming CSRF token needs to be sent as a header for subsequent requests
		this.axiosInstance.defaults.headers['X-Csrf-Token'] = csrfToken
		this.axiosInstance.defaults.headers['Cookie'] += `; TOKEN=${token}` // Append TOKEN cookie
        
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
				return await this.axiosInstance(config) // Retry the request after re-authentication
			} else {
				throw axiosError
			}
		}
	}
}
