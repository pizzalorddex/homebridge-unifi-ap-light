import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Logger } from 'homebridge'
import { UnifiDevice, UnifiApiResponse, UnifiApiError } from './models/unifiTypes.js'
import { UnifiApiHelper } from './api/unifiApiHelper.js'
import { filterRelevantAps } from './utils/apFilter.js'
import { errorHandler } from './utils/errorHandler.js'

/**
 * Retrieves a specific UniFi AP by its ID.
 *
 * @param {string} id The ID of the AP to retrieve.
 * @param {Function} requestFunction The function to execute the API request.
 * @param {UnifiApiHelper} apiHelper The API helper for endpoint resolution.
 * @param {string[]} sites List of site names to search in.
 * @param {Logger} log The Homebridge logger instance.
 * @returns {Promise<UnifiDevice | undefined>} The AP object, or undefined if not found.
 */
export async function getAccessPoint(
	id: string,
	requestFunction: (config: AxiosRequestConfig) => Promise<AxiosResponse<UnifiApiResponse<UnifiDevice>>>,
	apiHelper: UnifiApiHelper,
	sites: string[],
	log: Logger
): Promise<UnifiDevice | undefined> {
	const allAccessPoints = await getAccessPoints(requestFunction, apiHelper, sites, log)
	return allAccessPoints.find((ap: UnifiDevice) => ap._id === id)
}

/**
 * Type guard to check if the data is a UnifiApiResponse.
 * 
 * @param {unknown} data The data to check.
 * @returns {boolean} True if the data is a UnifiApiResponse, false otherwise.
 */
export function isUnifiApiResponse<T>(data: unknown): data is UnifiApiResponse<T> {
	return typeof data === 'object' && data !== null && Array.isArray((data as UnifiApiResponse<T>).data)
}

/**
 * Fetches all UniFi APs from multiple UniFi Controller sites.
 * Uses UnifiApiHelper to resolve the correct endpoint for each site.
 *
 * @param {Function} request API request function.
 * @param {UnifiApiHelper} apiHelper The API helper for endpoint resolution.
 * @param {string[]} sites Array of site names to query.
 * @param {Logger} log Homebridge logger instance.
 * @returns {Promise<UnifiDevice[]>} Aggregated array of access points across all sites.
 */
export async function getAccessPoints(
	request: (config: AxiosRequestConfig) => Promise<AxiosResponse<UnifiApiResponse<UnifiDevice>>>,
	apiHelper: UnifiApiHelper,
	sites: string[],
	log: Logger
): Promise<UnifiDevice[]> {
	const allDevices: UnifiDevice[] = []
	for (const site of sites) {
		let siteSuccess = false
		const endpoint = apiHelper.getDeviceListEndpoint(site)
		try {
			// Fetch devices for this site using the resolved endpoint
			const response = await request({ url: endpoint, method: 'get' })
			if (isUnifiApiResponse<UnifiDevice>(response.data)) {
				const devices = response.data.data.map((device: UnifiDevice) => ({
					...device,
					site, // tag the device with its site name
				}))
				log.debug(`Found ${devices.length} devices in site "${site}" via endpoint "${endpoint}"`)
				allDevices.push(...devices)
				siteSuccess = true
			} else {
				throw new UnifiApiError('Unexpected device list structure', { response })
			}
		} catch (error) {
			if (error instanceof UnifiApiError) {
				errorHandler(log, error, { site, endpoint })
				continue
			}
			const axiosError = error as AxiosError
			const status = axiosError.response?.status
			// Special handling for NoSiteContext error
			const data = axiosError.response?.data as { meta?: { msg?: string } }
			if (data?.meta?.msg === 'api.err.NoSiteContext') {
				log.error(`api.err.NoSiteContext: Site "${site}" is not recognized by the controller [endpoint: ${endpoint}]`)
				continue
			}
			if (status === 404) {
				log.warn(`Endpoint not found: ${endpoint} for site "${site}" (API structure may be incorrect or changed).`)
				continue
			}
			errorHandler(log, error, { site, endpoint })
		}
		if (!siteSuccess) {
			log.warn(`Error fetching devices from site "${site}" [endpoint: ${endpoint}]`)
		}
	}
	if (filterRelevantAps(allDevices).length === 0) {
		throw new Error('Failed to fetch any access points from any site.')
	}
	// Apply the strict AP filter here for compatibility
	return filterRelevantAps(allDevices)
}

/**
 * Fetches a single UniFi device by MAC address from the controller.
 * Uses UnifiApiHelper to resolve the correct endpoint for the site and API type.
 *
 * @param {string} mac The MAC address of the device.
 * @param {Function} requestFunction The function to execute the API request.
 * @param {UnifiApiHelper} apiHelper The API helper for endpoint resolution.
 * @param {string} site The site name to query.
 * @param {Logger} log Homebridge logger instance.
 * @returns {Promise<UnifiDevice | undefined>} The device object, or undefined if not found.
 */
export async function getDeviceByMac(
	mac: string,
	requestFunction: (config: AxiosRequestConfig) => Promise<AxiosResponse<UnifiApiResponse<UnifiDevice>>>,
	apiHelper: UnifiApiHelper,
	site: string,
	log: Logger
): Promise<UnifiDevice | undefined> {
	const endpoint = apiHelper.getSingleDeviceEndpoint(site, mac)
	try {
		const response = await requestFunction({ url: endpoint, method: 'get' })
		if (isUnifiApiResponse<UnifiDevice>(response.data) && response.data.data.length > 0) {
			return response.data.data[0]
		}
	} catch (err) {
		log.error(`Failed to fetch device by MAC (${mac}) from site ${site}: ${err}`)
	}
	return undefined
}
