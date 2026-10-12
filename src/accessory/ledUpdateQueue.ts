export interface LedChanges {
	on?: boolean
	hue?: number
	saturation?: number
	brightness?: number
}

interface Batch {
	changes: LedChanges
	waiters: { resolve: () => void; reject: (error: unknown) => void }[]
}

/** Groups a short HomeKit update burst and keeps controller writes in order. */
export class LedUpdateQueue {
	private pending?: Batch
	private active?: Batch
	private timer?: ReturnType<typeof setTimeout>
	private closed = false

	constructor(private readonly write: (changes: LedChanges) => Promise<void>) {}

	get busy(): boolean {
		return Boolean(this.pending || this.active)
	}

	update(changes: LedChanges): Promise<void> {
		if (this.closed) {
			return Promise.reject(new Error('LED updates stopped'))
		}
		return new Promise((resolve, reject) => {
			this.pending ??= { changes: {}, waiters: [] }
			Object.assign(this.pending.changes, changes)
			this.pending.waiters.push({ resolve, reject })
			this.schedule()
		})
	}

	close(): void {
		this.closed = true
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = undefined
		}
		for (const batch of [this.pending, this.active]) {
			for (const waiter of batch?.waiters ?? []) {
				waiter.reject(new Error('LED updates stopped'))
			}
		}
		this.pending = undefined
	}

	private schedule(): void {
		if (!this.active && !this.timer && !this.closed) {
			this.timer = setTimeout(() => { void this.flush() }, 50)
		}
	}

	private async flush(): Promise<void> {
		this.timer = undefined
		const batch = this.pending
		if (!batch || this.closed) {
			return
		}
		this.pending = undefined
		this.active = batch
		try {
			await this.write(batch.changes)
			for (const waiter of batch.waiters) {
				waiter.resolve()
			}
		} catch (error) {
			for (const waiter of batch.waiters) {
				waiter.reject(error)
			}
		} finally {
			this.active = undefined
			if (this.pending) {
				this.schedule()
			}
		}
	}
}
