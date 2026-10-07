import { UnifiDevice } from '../models/unifiTypes.js'

export function filterRelevantAps(
	aps: UnifiDevice[],
	includeIds?: string[],
	excludeIds?: string[]
): UnifiDevice[] {
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
