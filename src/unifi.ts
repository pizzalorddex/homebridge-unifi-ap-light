import { AxiosError } from 'axios'
import { Logger } from 'homebridge'

// Define a generic type for a UniFi Wireless Access Point (AP).
type UniFiAP = any

/**
 * Retrieves a specific UniFi AP by its ID.
 * 
 * @param {string} id The ID of the AP to retrieve.
 * @param {Function} requestFunction The function to execute the API request.
 * @param {string[]} sites List of site names to search in.
 * @param {Logger} log The Homebridge logger instance.
 * @returns {Promise<UniFiAP | undefined>} The AP object, or undefined if not found.
 */
export async function getAccessPoint(
	id: string,
	requestFunction: (config: any) => Promise<any>,
	sites: string[],
	log: Logger
): Promise<UniFiAP | undefined> {
	const allAccessPoints = await getAccessPoints(requestFunction, sites, log)
	return allAccessPoints.find((ap: UniFiAP) => ap._id === id)
}

/**
 * Fetches all UniFi APs from multiple UniFi Controller sites.
 * Includes devices of type 'uap' and 'udm' (limited to model 'UDM' or 'UDR').
 *
 * @param {Function} request API request function.
 * @param {string[]} sites Array of site names to query.
 * @param {Logger} log Homebridge logger instance.
 * @returns {Promise<UniFiAP[]>} Aggregated array of access points across all sites.
 */
export async function getAccessPoints(
	request: (config: any) => Promise<any>,
	sites: string[],
	log: Logger
): Promise<UniFiAP[]> {
	const allDevices: UniFiAP[] = []
	const endpoints = ['stat/device', 'proxy/network/api/s/{site}/stat/device']

	for (const site of sites) {
		let siteSuccess = false

		// Build API endpoints dynamically based on site.
		for (const baseEndpoint of endpoints) {
			const endpoint = baseEndpoint.includes('{site}')
				? `/${baseEndpoint.replace('{site}', site)}`
				: `/api/s/${site}/${baseEndpoint}`

			try {
				const response = await request({ url: endpoint, method: 'get' })

				if (response && response.data && Array.isArray(response.data.data)) {
					// Filter and return only devices of type 'uap' and 'udm'
					const devices = response.data.data
						.filter((device: any) =>
							device.type === 'uap' ||
							(device.type === 'udm' && (device.model === 'UDM' || device.model === 'UDR'))
						)
						.map((device: any) => ({
							...device,
							site, // tag the device with its site name
						}))

					log.debug(`Found ${devices.length} devices in site "${site}" via ${endpoint}`)
					allDevices.push(...devices)
					siteSuccess = true
					break // Stop trying other endpoints for this site
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
					break
				}

				// Continue trying the next endpoint in case the current one is not found (404)
				if (status === 404) {
					log.debug(`Endpoint not found: ${endpoint}, trying next endpoint for site "${site}"`)
					continue
				}

				// Log all other errors and stop trying this site
				log.warn(`Error fetching devices from site "${site}" at ${endpoint}: ${axiosError.message}`)
				break
			}
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
