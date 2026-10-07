import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Logger } from 'homebridge'
import { UnifiDevice, UnifiApiResponse, UnifiApiError } from './models/unifiTypes.js'
import { UnifiApiHelper } from './api/unifiApiHelper.js'
import { filterRelevantAps } from './utils/apFilter.js'
import { errorHandler } from './utils/errorHandler.js'

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

export function isUnifiApiResponse<T>(data: unknown): data is UnifiApiResponse<T> {
	return typeof data === 'object' && data !== null && Array.isArray((data as UnifiApiResponse<T>).data)
}

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
			const response = await request({ url: endpoint, method: 'get' })
			if (isUnifiApiResponse<UnifiDevice>(response.data)) {
				const devices = response.data.data.map((device: UnifiDevice) => ({
					...device,
					site,
				}))
				log.debug(`[API] Found ${devices.length} devices via endpoint "${endpoint}"`)
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
			const data = axiosError.response?.data as { meta?: { msg?: string } }
			if (data?.meta?.msg === 'api.err.NoSiteContext') {
				log.error(`[API] api.err.NoSiteContext: Site "${site}" is not recognized by the controller [endpoint: ${endpoint}]`)
				continue
			}
			if (status === 404) {
				log.warn(`[API] Endpoint not found: ${endpoint} (API structure may be incorrect or changed).`)
				continue
			}
			errorHandler(log, error, { site, endpoint })
		}
		if (!siteSuccess) {
			log.warn(`[API] Error fetching devices [endpoint: ${endpoint}]`)
		}
	}
	if (filterRelevantAps(allDevices).length === 0) {
		throw new Error('Failed to fetch any access points from any site.')
	}
	return filterRelevantAps(allDevices)
}

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
		log.error(`[API] Failed to fetch device by MAC (${mac}): ${err}`)
	}
	return undefined
}
