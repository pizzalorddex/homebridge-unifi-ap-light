import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiApiError, UnifiAuthError, UnifiNetworkError, UnifiConfigError } from '../../src/models/unifiTypes.js';

describe('Custom Error Classes', () => {
  it('should create UnifiApiError with message and cause', () => {
    const err = new UnifiApiError('api error', new Error('cause'));
    expect(err.message).toBe('api error');
    expect(err.cause).toBeInstanceOf(Error);
  });

  it('should create UnifiAuthError with message and cause', () => {
    const err = new UnifiAuthError('auth error', new Error('cause'));
    expect(err.message).toBe('auth error');
    expect(err.cause).toBeInstanceOf(Error);
  });

  it('should create UnifiNetworkError with message and cause', () => {
    const err = new UnifiNetworkError('network error', new Error('cause'));
    expect(err.message).toBe('network error');
    expect(err.cause).toBeInstanceOf(Error);
  });

  it('should create UnifiConfigError with message', () => {
    const err = new UnifiConfigError('config error');
    expect(err.message).toBe('config error');
  });
});
