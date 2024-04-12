import { AxiosError } from 'axios'

// Define a generic type for a UniFi Wireless Access Point (WAP).
type UniFiWAP = any

/**
 * Retrieves a specific UniFi WAP by its ID.
 * 
 * @param {string} id The ID of the WAP to retrieve.
 * @param {Function} requestFunction The function to execute the API request.
 * @returns {Promise<UniFiWAP | undefined>} A promise that resolves to the WAP object, or undefined if not found.
 */
export async function getAccessPoint(id: string, requestFunction: (config: any) => Promise<any>): Promise<UniFiWAP | undefined> {
	const accessPoints = await getAccessPoints(requestFunction)
	return accessPoints.find((ap: UniFiWAP) => ap._id === id)
}

/**
 * Fetches all UniFi WAPs available in the controller.
 * 
 * @param {Function} request The function to execute the API request.
 * @returns {Promise<UniFiWAP[]>} A promise that resolves to an array of WAP objects.
 * Attempts to fetch data from multiple endpoints to ensure compatibility across different UniFi Controller versions.
 */
export async function getAccessPoints(request: (config: any) => Promise<any>): Promise<UniFiWAP[]> {
	const endpoints = ['/s/default/stat/device', '/proxy/network/api/s/default/stat/device']
	for (const endpoint of endpoints) {
		try {
			const response = await request({ url: endpoint, method: 'get' })
			if (response && response.data && response.data.data) {
				// Filter and return only devices of type 'uap' (UniFi Access Points).
				return response.data.data.filter((device: any) => device.type === 'uap')
			} else {
				throw new Error('API returned no data or unexpected data structure')
			}
		} catch (error) {
			const axiosError = error as AxiosError
			// Continue trying the next endpoint in case the current one is not found (404).
			if (axiosError.response && axiosError.response.status === 404 && endpoint !== endpoints[endpoints.length - 1]) {
				continue
			} else {
				// Rethrow the error if it's not a 404 or if it's the last endpoint.
				throw axiosError
			}
		}
	}
	throw new Error('Failed to fetch access points from UniFi Controller.')
}
