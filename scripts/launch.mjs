import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'
const viteEntry = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

async function findPort() {
  const preferred = Number(process.env.ROLEFIT_CV_PORT) || 5317

  for (let port = preferred; port < preferred + 80; port += 1) {
    if (await portIsFree(port)) return port
  }

  throw new Error(`No free local port found from ${preferred} to ${preferred + 79}.`)
}

function installDependenciesIfNeeded() {
  if (existsSync(path.join(rootDir, 'node_modules', 'vite'))) return

  console.log('Installing app dependencies. This happens only on the first run.')
  const result = spawnSync(npmCommand, ['install'], {
    cwd: rootDir,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error('Dependency install failed.')
  }
}

function openBrowser(url) {
  if (process.env.ROLEFIT_CV_NO_OPEN === '1') return

  const command = isWindows ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = isWindows ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('The local server stopped before Rolefit CV was ready.')
    }

    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

installDependenciesIfNeeded()

const port = await findPort()
const url = `http://127.0.0.1:${port}/`

console.log(`Starting Rolefit CV on ${url}`)
console.log('Close this window, or press Ctrl+C, to stop the app.')
console.log('')

const server = spawn(
  process.execPath,
  [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: rootDir,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  },
)

server.stdout.on('data', (data) => process.stdout.write(data))
server.stderr.on('data', (data) => process.stderr.write(data))

let shuttingDown = false

function stopServer(signal = 'SIGINT') {
  if (shuttingDown) return
  shuttingDown = true
  if (!server.killed && server.exitCode === null) server.kill(signal)
}

process.on('SIGINT', () => stopServer('SIGINT'))
process.on('SIGTERM', () => stopServer('SIGTERM'))
process.on('exit', () => stopServer('SIGTERM'))

try {
  await waitForServer(url, server)
  console.log('')
  console.log(`Rolefit CV is ready: ${url}`)
  openBrowser(url)
} catch (error) {
  stopServer('SIGTERM')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}

await new Promise((resolve) => {
  server.on('exit', resolve)
})
