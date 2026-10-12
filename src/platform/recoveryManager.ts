import type { UnifiAPLight } from '../platform.js'

/** Uses the shared device refresh for immediate recovery. */
export class RecoveryManager {
	constructor(private readonly platform: UnifiAPLight) {}

	public forceImmediateCacheRefresh(): Promise<void> {
		return this.platform.refreshDeviceCache()
	}
}
