// Test fixtures for API responses
import path from 'path'
import fs from 'fs'

export function loadFixture(name: string) {
	if (name === 'site-list-success.fixture.json') {
		// Return a generic, non-sensitive site-list-success fixture
		return {
			meta: { rc: 'ok', msg: '', up: true },
			data: [
				{
					_id: 'siteid123',
					name: 'default',
					desc: 'Default',
					role: 'admin',
					attr_hidden_id: 'default',
					attr_no_delete: true,
					attr_is_default: true
				}
			]
		}
	}
	const filePath = path.resolve(__dirname, name)
	return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}
