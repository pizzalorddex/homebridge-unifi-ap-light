import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Logger } from 'homebridge'
import { UnifiDevice, UnifiApiResponse } from './models/unifiTypes.js'
import { UnifiApiHelper } from './api/unifiApiHelper.js'

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
				// Filter and return only devices of type 'uap' and 'udm'
				const devices = response.data.data
					.filter((device: UnifiDevice) =>
						device.type === 'uap' ||
            (device.type === 'udm' && (device.model === 'UDM' || device.model === 'UDR'))
					)
					.map((device: UnifiDevice) => ({
						...device,
						site, // tag the device with its site name
					}))
				log.debug(`Found ${devices.length} devices in site "${site}" via ${endpoint}`)
				allDevices.push(...devices)
				siteSuccess = true
			} else {
				throw new Error('API returned no data or unexpected data structure')
			}
		} catch (error) {
			const axiosError = error as AxiosError
			const status = axiosError.response?.status
			// Special handling for NoSiteContext error
			const data = axiosError.response?.data as { meta?: { msg?: string } }
			if (data?.meta?.msg === 'api.err.NoSiteContext') {
				log.error(`Site "${site}" is not recognized by the controller (api.err.NoSiteContext).`)
				continue
			}
			if (status === 404) {
				log.warn(`Endpoint not found: ${endpoint} for site "${site}" (API structure may be incorrect or changed).`)
				continue
			}
			log.warn(`Error fetching devices from site "${site}" at ${endpoint}: ${axiosError.message}`)
		}
		if (!siteSuccess) {
			log.warn(`No valid device endpoint succeeded for site "${site}".`)
		}
	}
	if (allDevices.length === 0) {
		throw new Error('Failed to fetch any access points from any site.')
	}
	return allDevices
}
