import { describe, it, expect, beforeEach } from 'vitest'
import { filterRelevantAps } from '../../src/utils/apFilter.js'
import { loadFixture } from '../fixtures/apiFixtures'
import { type UnifiDevice } from '../../src/models/unifiTypes.js'

describe('filterRelevantAps', () => {
	let aps: UnifiDevice[]

	beforeEach(() => {
		// Use the device-list-success fixture for APs
		aps = loadFixture('device-list-success.fixture.json').data as UnifiDevice[]
	})

	it('returns only APs (type uap or udm) when no includeIds or excludeIds are provided', () => {
		const result = filterRelevantAps(aps)
		// Only APs and UDMs should be returned
		const expectedIds = aps.filter(ap => ap.type === 'uap' || ap.type === 'udm').map(ap => ap._id)
		expect(result.every(ap => ap.type === 'uap' || ap.type === 'udm')).toBe(true)
		expect(result.map(ap => ap._id)).toEqual(expectedIds)
	})

	it('returns only APs with IDs in includeIds (ignores switches)', () => {
		const includeIds = aps.map(ap => ap._id) // all IDs, but only APs/UDMs should be returned
		const result = filterRelevantAps(aps, includeIds)
		const expectedIds = aps.filter(ap => (ap.type === 'uap' || ap.type === 'udm') && includeIds.includes(ap._id)).map(ap => ap._id)
		expect(result.map(ap => ap._id)).toEqual(expectedIds)
	})

	it('returns all APs except those in excludeIds (ignores switches)', () => {
		const excludeIds = aps.filter(ap => ap.type === 'udm').map(ap => ap._id)
		const result = filterRelevantAps(aps, undefined, excludeIds)
		const expectedIds = aps.filter(ap => ap.type === 'uap' && !excludeIds.includes(ap._id)).map(ap => ap._id)
		expect(result.map(ap => ap._id)).toEqual(expectedIds)
	})

	it('returns only APs in includeIds and not in excludeIds', () => {
		const includeIds = aps.filter(ap => ap.type === 'uap' || ap.type === 'udm').map(ap => ap._id)
		const excludeIds = [includeIds[0]]
		const result = filterRelevantAps(aps, includeIds, excludeIds)
		const expectedIds = includeIds.filter(id => !excludeIds.includes(id))
		expect(result.map(ap => ap._id)).toEqual(expectedIds)
	})

	it('returns empty array if includeIds does not match any APs', () => {
		const result = filterRelevantAps(aps, ['nonexistent'])
		expect(result).toHaveLength(0)
	})

	it('returns empty array if all APs are excluded', () => {
		const excludeIds = aps.filter(ap => ap.type === 'uap' || ap.type === 'udm').map(ap => ap._id)
		const result = filterRelevantAps(aps, undefined, excludeIds)
		expect(result).toHaveLength(0)
	})

	it('returns empty array if includeIds and excludeIds filter out all APs', () => {
		const includeIds = aps.filter(ap => ap.type === 'uap').map(ap => ap._id)
		const result = filterRelevantAps(aps, includeIds, includeIds)
		expect(result).toHaveLength(0)
	})

	it('handles empty APs array', () => {
		const result = filterRelevantAps([])
		expect(result).toEqual([])
	})

	it('handles empty includeIds and excludeIds arrays', () => {
		const result = filterRelevantAps(aps, [], [])
		const expectedIds = aps.filter(ap => ap.type === 'uap' || ap.type === 'udm').map(ap => ap._id)
		expect(result.every(ap => ap.type === 'uap' || ap.type === 'udm')).toBe(true)
		expect(result.map(ap => ap._id)).toEqual(expectedIds)
	})
})
