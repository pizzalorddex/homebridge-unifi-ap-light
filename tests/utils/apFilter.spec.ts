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

	describe('type/model filtering', () => {
		it('includes only uap and udm with model UDM/UDR', () => {
			const devices = [
				{ _id: '1', type: 'uap', model: 'U7' }, // include
				{ _id: '2', type: 'udm', model: 'UDM' }, // include
				{ _id: '3', type: 'udm', model: 'UDR' }, // include
				{ _id: '4', type: 'udm', model: 'Dream Machine' }, // exclude
				{ _id: '5', type: 'usw', model: 'Switch' }, // exclude
				{ _id: '6', type: 'ugw', model: 'Gateway' }, // exclude
				{ _id: '7', type: 'uap' }, // include
				{ _id: '8', type: 'udm' }, // exclude (model missing)
				{ _id: '9', model: 'UDM' }, // exclude (type missing)
				{ _id: '10' }, // exclude (type/model missing)
			]
			const result = filterRelevantAps(devices as any)
			const expectedIds = ['1', '2', '3', '7']
			expect(result.map(d => d._id)).toEqual(expectedIds)
		})

		it('handles device with missing _id', () => {
			const devices = [
				{ type: 'uap', model: 'U7' },
				{ _id: '2', type: 'uap', model: 'U7' },
			]
			const result = filterRelevantAps(devices as any)
			// Should include both, but only one has _id
			expect(result.length).toBe(2)
			// Filtering with includeIds should only match the one with _id
			const filtered = filterRelevantAps(devices as any, ['2'])
			expect(filtered.length).toBe(1)
			expect(filtered[0]._id).toBe('2')
		})
	})

	describe('includeIds/excludeIds edge cases', () => {
		const devices = [
			{ _id: '1', type: 'uap', model: 'U7' },
			{ _id: '2', type: 'uap', model: 'U7' },
		]
		it('handles includeIds = null', () => {
			const result = filterRelevantAps(devices as any, null as any)
			expect(result.length).toBe(2)
		})
		it('handles excludeIds = null', () => {
			const result = filterRelevantAps(devices as any, undefined, null as any)
			expect(result.length).toBe(2)
		})
		it('handles includeIds = undefined', () => {
			const result = filterRelevantAps(devices as any, undefined)
			expect(result.length).toBe(2)
		})
		it('handles excludeIds = undefined', () => {
			const result = filterRelevantAps(devices as any, undefined, undefined)
			expect(result.length).toBe(2)
		})
	})
})
