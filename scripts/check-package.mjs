import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const npm = process.env.npm_execpath
assert(npm, 'Run this check with npm run check:package')
const runNpm = (args, cwd) => execFileSync(process.execPath, [npm, ...args], {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const work = mkdtempSync(join(tmpdir(), 'ap-lights-package-'))

try {
  const [pack] = JSON.parse(runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', work]))
  const required = ['package.json', 'dist/index.js', 'dist/index.d.ts', 'config.schema.json',
    'README.md', 'CHANGELOG.md', 'LICENSE', 'docs/COMPATIBILITY.md']
  const paths = pack.files.map(file => file.path)
  for (const path of required) assert(paths.includes(path), `Missing package file: ${path}`)
  for (const path of paths) {
    assert(required.includes(path) || /^dist\/[\w/.-]+\.(js|d\.ts)(\.map)?$/.test(path),
      `Unexpected package file: ${path}`)
  }

  runNpm(['install', '--prefix', work, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund',
    join(work, pack.filename)])
  const installed = join(work, 'node_modules', pack.name)
  const metadata = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
  assert.equal(metadata.version, pack.version)
  for (const hook of ['preinstall', 'install', 'postinstall']) {
    assert(!metadata.scripts?.[hook], `Unexpected installation hook: ${hook}`)
  }
  const schema = JSON.parse(readFileSync(join(installed, 'config.schema.json'), 'utf8'))
  assert.equal(schema.pluginType, 'platform')
  let Platform
  const { default: register } = await import(pathToFileURL(join(installed, metadata.main)).href)
  register({ registerPlatform: (alias, implementation) => {
    assert.equal(alias, schema.pluginAlias)
    Platform = implementation
  } })
  assert.equal(typeof Platform, 'function')
  const log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, () => {}]))
  const callbacks = new Map()
  const api = { hap: { Service: {}, Characteristic: {} }, on: (event, callback) => callbacks.set(event, callback) }
  new Platform(log, {}, api)
  assert.equal(callbacks.size, 0, 'An unconfigured platform must stay idle')
  new Platform(log, { platform: schema.pluginAlias, name: 'Package test', host: 'localhost',
    username: 'test', password: 'test' }, api)
  assert(callbacks.has('didFinishLaunching'), 'Configured platform must register startup')
  assert(callbacks.has('shutdown'), 'Configured platform must register shutdown cleanup')
  callbacks.get('shutdown')()
  console.log(`Package check passed: ${pack.name}@${pack.version}, ${paths.length} files, clean install and load`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
