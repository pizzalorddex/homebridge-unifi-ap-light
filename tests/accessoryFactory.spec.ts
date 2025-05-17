import { describe, it, expect, vi } from 'vitest';
import { createAndRegisterAccessory, markAccessoryNotResponding } from '../src/accessoryFactory.js';

describe('accessoryFactory', () => {
  it('should export createAndRegisterAccessory as a function', () => {
    expect(typeof createAndRegisterAccessory).toBe('function');
  });

  it('should mark accessory as Not Responding', () => {
    const updateCharacteristic = vi.fn();
    const service = { updateCharacteristic };
    const accessory = { getService: vi.fn(() => service) };
    const platform = { Service: { Lightbulb: {} }, Characteristic: { On: 'On' } };
    markAccessoryNotResponding(platform as any, accessory as any);
    expect(updateCharacteristic).toHaveBeenCalledWith('On', new Error('Not Responding'));
  });

  it('should do nothing if Lightbulb service is missing', () => {
    const accessory = { getService: vi.fn(() => undefined) };
    const platform = { Service: { Lightbulb: {} }, Characteristic: { On: 'On' } };
    expect(() => markAccessoryNotResponding(platform as any, accessory as any)).not.toThrow();
  });
});
