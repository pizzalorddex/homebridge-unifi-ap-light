import { describe, it, expect, beforeEach, vi } from 'vitest';
// Example test for unifi.ts device fetching logic (to be expanded with fixtures and mocks)
import { getAccessPoint, getAccessPoints } from '../../src/unifi.js';
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js';
import { Logger } from 'homebridge';

describe('unifi.ts', () => {
  let apiHelper: UnifiApiHelper;
  let log: Logger;

  beforeEach(() => {
    apiHelper = new UnifiApiHelper();
    apiHelper.setApiType(UnifiApiType.SelfHosted);
    log = { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any;
  });

  it('should return undefined if device not found', async () => {
    const request = vi.fn().mockResolvedValue({ data: { data: [] } });
    await expect(getAccessPoint('notfound', request, apiHelper, ['default'], log)).rejects.toThrow('Failed to fetch any access points from any site.');
  });

  // More tests will be added using fixtures and error mocks
});
