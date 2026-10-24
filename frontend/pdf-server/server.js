import * as http from 'node:http'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { WorkerPool } from './workerPool.js'

const { values: args } = parseArgs({
  options: {
    dev: { type: 'boolean', default: false },
  },
})

const dir = path.dirname(fileURLToPath(import.meta.url))
const entryUrl = pathToFileURL(path.join(dir, 'dist', 'entry.js')).href
const publicDir = path.join(dir, '..', 'public')
const port = Number(process.env.PDF_SERVER_PORT ?? 3006)
const workers = Number(process.env.PDF_SERVER_WORKERS ?? 2)

let pool = null

function startPool() {
  pool = new WorkerPool({ size: workers, entryUrl, publicDir })
}

async function restartPool() {
  const oldPool = pool
  startPool()
  await oldPool?.close()
}

async function buildAndWatch() {
  const { build } = await import('vite')
  const watcher = await build({
    configFile: path.join(dir, 'vite.config.js'),
    build: { watch: {} },
  })
  let resolveFirstBuild
  const firstBuild = new Promise((resolve) => (resolveFirstBuild = resolve))
  watcher.on('event', (event) => {
    if (event.code === 'ERROR') {
      console.error(event.error)
    }
    if (event.code === 'END') {
      resolveFirstBuild()
      if (pool) {
        console.log('Bundle rebuilt, restarting PDF workers')
        restartPool()
      }
    }
  })
  await firstBuild
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('error', reject)
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
  })
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function createMeasurements() {
  const start = performance.now()
  const phases = {}
  let currentPhase = null
  let pages = 0
  return {
    onProgress(state, params = {}) {
      if (state === 'renderingPdfPage') pages = params.totalPages ?? pages
      if (state === currentPhase) return
      const now = performance.now()
      if (currentPhase) phases[currentPhase] = Math.round(now - phases[currentPhase])
      currentPhase = state
      phases[state] = now
    },
    finish() {
      const now = performance.now()
      if (currentPhase) phases[currentPhase] = Math.round(now - phases[currentPhase])
      return { total: Math.round(now - start), phases, pages }
    },
  }
}

async function handleRender(req, res) {
  const logOutput = { timestamp: new Date(), type: 'pdf-server', status: 200 }
  const measurements = createMeasurements()
  try {
    const data = await readJsonBody(req)
    logOutput.contents = data?.config?.contents?.map((content) => content.type)
    const pdf = await pool.render(data, measurements.onProgress)
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.byteLength,
    })
    res.end(pdf)
  } catch (error) {
    logOutput.status = 500
    logOutput.error = error.message
    console.error(error)
    sendJson(res, 500, { error: error.message })
  } finally {
    logOutput.measurements = measurements.finish()
    console.log(JSON.stringify(logOutput))
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, {
      uptime: process.uptime(),
      workers: pool.size,
      message: 'Ok',
    })
  }
  if (req.method === 'POST' && pathname === '/render') {
    return handleRender(req, res)
  }
  sendJson(res, 404, { error: 'Not found' })
})

if (args.dev) {
  await buildAndWatch()
}
startPool()
server.listen(port, () => {
  console.log(`PDF server listening on port ${port} with ${workers} workers`)
})
