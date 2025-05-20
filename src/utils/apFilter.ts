import { UnifiDevice } from '../models/unifiTypes.js'

/**
 * Filters APs based on type (uap/udm with model UDM/UDR), then includeIds and excludeIds config.
 *
 * @param aps All discovered devices
 * @param includeIds List of AP IDs to include (optional)
 * @param excludeIds List of AP IDs to exclude (optional)
 * @returns Filtered list of relevant APs
 */
export function filterRelevantAps(
	aps: UnifiDevice[],
	includeIds?: string[],
	excludeIds?: string[]
): UnifiDevice[] {
	// Only consider APs (type 'uap', or type 'udm' with model 'UDM' or 'UDR')
	let filtered = aps.filter(ap =>
		ap.type === 'uap' ||
		(ap.type === 'udm' && (ap.model === 'UDM' || ap.model === 'UDR'))
	)
	if (includeIds && includeIds.length > 0) {
		filtered = filtered.filter(ap => includeIds.includes(ap._id))
	}
	if (excludeIds && excludeIds.length > 0) {
		filtered = filtered.filter(ap => !excludeIds.includes(ap._id))
	}
	return filtered
}
