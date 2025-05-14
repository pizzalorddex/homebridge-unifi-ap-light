// Test fixtures for API responses
import path from 'path';
import fs from 'fs';

export function loadFixture(name: string) {
  const filePath = path.resolve(__dirname, '../API Testing', name);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}
