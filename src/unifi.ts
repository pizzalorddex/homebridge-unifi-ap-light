import { AxiosError } from 'axios'

// Define a generic type for a UniFi Wireless Access Point (AP).
type UniFiAP = any

/**
 * Retrieves a specific UniFi AP by its ID.
 * 
 * @param {string} id The ID of the AP to retrieve.
 * @param {Function} requestFunction The function to execute the API request.
 * @returns {Promise<UniFiAP | undefined>} A promise that resolves to the AP object, or undefined if not found.
 */
export async function getAccessPoint(id: string, requestFunction: (config: any) => Promise<any>): Promise<UniFiAP | undefined> {
	const accessPoints = await getAccessPoints(requestFunction)
	return accessPoints.find((ap: UniFiAP) => ap._id === id)
}

/**
* Fetches all UniFi APs available in the controller.
 * Includes devices of type 'uap' and 'udm', but filters 'udm' to only include model 'UDM'.
 * @param {Function} request The function to execute the API request.
 * @returns {Promise<UniFiAP[]>} A promise that resolves to an array of AP objects.
 * Attempts to fetch data from multiple endpoints to ensure compatibility across different UniFi Controller versions.
 */
export async function getAccessPoints(request: (config: any) => Promise<any>): Promise<UniFiAP[]> {
	const endpoints = ['/api/s/default/stat/device', '/proxy/network/api/s/default/stat/device']
	for (const endpoint of endpoints) {
		const config = { url: endpoint, method: 'get' }
		console.log(`Requesting URL: ${config.url}`)
		try {
			const response = await request({ url: endpoint, method: 'get' })
			if (response && response.data && response.data.data) {
				// Filter and return only devices of type 'uap' and 'udm'
				return response.data.data.filter((device: any) => 
					(device.type === 'uap' || (device.type === 'udm' && (device.model === 'UDM' || device.model === 'UDR')))
				)
			} else {
				throw new Error('API returned no data or unexpected data structure')
			}
		} catch (error) {
			const axiosError = error as AxiosError
			// Continue trying the next endpoint in case the current one is not found (404).
			if (axiosError.response && axiosError.response.status === 404 && endpoint !== endpoints[endpoints.length - 1]) {
				console.debug(`Endpoint not found: ${endpoint}, trying next endpoint`)
				continue
			} else {
				// Rethrow the error if it's not a 404 or if it's the last endpoint.
				throw axiosError
			}
		}
	}
	throw new Error('Failed to fetch access points from UniFi Controller.')
}
