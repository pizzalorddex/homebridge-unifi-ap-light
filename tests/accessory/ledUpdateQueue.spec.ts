import { afterEach, describe, expect, it, vi } from 'vitest'
import { LedUpdateQueue } from '../../src/accessory/ledUpdateQueue.js'

afterEach(() => vi.useRealTimers())

function deferred() {
	let resolve!: () => void
	let reject!: (error: unknown) => void
	const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
	return { promise, resolve, reject }
}

describe('LED update batching', () => {
	it('groups simultaneous changes into one write and waits for acceptance', async () => {
		vi.useFakeTimers()
		const response = deferred()
		const write = vi.fn(() => response.promise)
		const queue = new LedUpdateQueue(write)
		let accepted = false
		const updates = Promise.all([queue.update({ hue: 120 }), queue.update({ saturation: 100 }), queue.update({ brightness: 75 })]).then(() => { accepted = true })
		await vi.advanceTimersByTimeAsync(50)
		expect(write).toHaveBeenCalledExactlyOnceWith({ hue: 120, saturation: 100, brightness: 75 })
		expect(accepted).toBe(false)
		response.resolve()
		await updates
		expect(queue.busy).toBe(false)
	})

	it('serializes an in-flight write and retains the newest pending value', async () => {
		vi.useFakeTimers()
		const response = deferred()
		const write = vi.fn().mockReturnValueOnce(response.promise).mockResolvedValue(undefined)
		const queue = new LedUpdateQueue(write)
		const first = queue.update({ on: true })
		await vi.advanceTimersByTimeAsync(50)
		const pending = Promise.all([queue.update({ hue: 120 }), queue.update({ hue: 240 }), queue.update({ brightness: 25 })])
		await vi.advanceTimersByTimeAsync(500)
		expect(write).toHaveBeenCalledOnce()
		response.resolve()
		await first
		await vi.advanceTimersByTimeAsync(50)
		await pending
		expect(write.mock.calls.map(([changes]) => changes)).toEqual([{ on: true }, { hue: 240, brightness: 25 }])
	})

	it('bounds the first batch window even when more values arrive', async () => {
		vi.useFakeTimers()
		const write = vi.fn().mockResolvedValue(undefined)
		const queue = new LedUpdateQueue(write)
		const first = queue.update({ hue: 10 })
		await vi.advanceTimersByTimeAsync(40)
		const second = queue.update({ hue: 20 })
		await vi.advanceTimersByTimeAsync(10)
		await Promise.all([first, second])
		expect(write).toHaveBeenCalledExactlyOnceWith({ hue: 20 })
	})

	it('rejects every batched caller on failure and allows a later update', async () => {
		vi.useFakeTimers()
		const write = vi.fn().mockRejectedValueOnce(new Error('Controller rejected')).mockResolvedValue(undefined)
		const queue = new LedUpdateQueue(write)
		const result = Promise.allSettled([queue.update({ hue: 120 }), queue.update({ brightness: 50 })])
		await vi.advanceTimersByTimeAsync(50)
		expect((await result).map(value => value.status)).toEqual(['rejected', 'rejected'])
		const retry = queue.update({ brightness: 75 })
		await vi.advanceTimersByTimeAsync(50)
		await expect(retry).resolves.toBeUndefined()
	})

	it('cancels queued changes and refuses updates after shutdown', async () => {
		vi.useFakeTimers()
		const write = vi.fn().mockResolvedValue(undefined)
		const queue = new LedUpdateQueue(write)
		const result = Promise.allSettled([queue.update({ on: true })])
		queue.close()
		await vi.advanceTimersByTimeAsync(100)
		expect((await result)[0].status).toBe('rejected')
		expect(write).not.toHaveBeenCalled()
		await expect(queue.update({ on: false })).rejects.toThrow('stopped')
	})

	it('rejects active callers on shutdown and never sends the next batch', async () => {
		vi.useFakeTimers()
		const response = deferred()
		const write = vi.fn(() => response.promise)
		const queue = new LedUpdateQueue(write)
		const first = queue.update({ hue: 120 })
		const firstResult = Promise.allSettled([first])
		await vi.advanceTimersByTimeAsync(50)
		const pendingResult = Promise.allSettled([queue.update({ brightness: 50 })])
		queue.close()
		expect((await firstResult)[0].status).toBe('rejected')
		expect((await pendingResult)[0].status).toBe('rejected')
		response.resolve()
		await vi.advanceTimersByTimeAsync(100)
		expect(write).toHaveBeenCalledOnce()
	})
})
