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
	if (name === 'device-list-success.fixture.json') {
		// Return a generic, non-sensitive device-list-success fixture (structure based on real data, but anonymized)
		return {
			meta: { rc: 'ok', msg: '', up: true },
			data: [
				{
					_id: 'apid123',
					mac: '00:11:22:33:44:55',
					site: 'default',
					type: 'uap',
					model: 'UAP-AC-Lite',
					name: 'Test AP 1',
					serial: 'serial123',
					version: '5.43.23',
					last_seen: 1716000000,
					uptime: 123456,
					state: 1,
					led_override: 'on',
					ledSettings: { enabled: true }
				},
				{
					_id: 'udmid456',
					mac: '00:11:22:33:44:66',
					site: 'default',
					type: 'udm',
					model: 'UDM',
					name: 'Test UDM',
					serial: 'serial456',
					version: '2.0.0',
					last_seen: 1716000001,
					uptime: 654321,
					state: 1,
					ledSettings: { enabled: false }
				},
				{
					_id: 'switchid789',
					mac: '00:11:22:33:44:77',
					site: 'default',
					type: 'usw',
					model: 'USW-Lite-8-PoE',
					name: 'Test Switch',
					serial: 'serial789',
					version: '1.1.1',
					last_seen: 1716000002,
					uptime: 111111,
					state: 1
				}
			]
		}
	}
	const filePath = path.resolve(__dirname, name)
	return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}
