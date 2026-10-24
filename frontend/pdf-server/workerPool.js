import { Worker } from 'node:worker_threads'

const workerFile = new URL('./worker.js', import.meta.url)

export class WorkerPool {
  #size
  #workerData
  #workers = new Set()
  #idle = []
  #queue = []
  #nextJobId = 1
  #closed = false

  constructor({ size, entryUrl, publicDir }) {
    this.#size = size
    this.#workerData = { entryUrl, publicDir }
    for (let i = 0; i < size; i++) {
      this.#spawn()
    }
  }

  get size() {
    return this.#size
  }

  render(data, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ id: this.#nextJobId++, data, onProgress, resolve, reject })
      this.#pump()
    })
  }

  async close() {
    this.#closed = true
    this.#queue.splice(0).forEach((job) => job.reject(new Error('Worker pool closed')))
    await Promise.all([...this.#workers].map((worker) => worker.terminate()))
  }

  #spawn() {
    const worker = new Worker(workerFile, { workerData: this.#workerData })
    worker.job = null
    this.#workers.add(worker)

    worker.on('message', (message) => {
      if (message.ready) {
        worker.ready = true
        this.#idle.push(worker)
        this.#pump()
        return
      }
      const job = worker.job
      if (!job || job.id !== message.id) return
      if (message.progress) {
        job.onProgress(message.progress.state, message.progress.params)
        return
      }
      worker.job = null
      if (message.error) {
        job.reject(
          Object.assign(new Error(message.error.message), { stack: message.error.stack })
        )
      } else {
        job.resolve(message.pdf)
      }
      this.#idle.push(worker)
      this.#pump()
    })

    const onGone = (error) => {
      this.#workers.delete(worker)
      this.#idle = this.#idle.filter((idle) => idle !== worker)
      if (this.#closed) return
      console.error('PDF worker died', error)
      if (worker.job) {
        worker.job.reject(new Error(`PDF worker died: ${error.message}`))
        worker.job = null
      }
      if (!worker.ready) {
        this.#queue.splice(0).forEach((job) => job.reject(error))
      }
      setTimeout(() => !this.#closed && this.#spawn(), 1000)
    }
    worker.on('error', onGone)
    worker.on('exit', (code) => {
      if (code !== 0) onGone(new Error(`PDF worker exited with code ${code}`))
    })
  }

  #pump() {
    while (this.#idle.length > 0 && this.#queue.length > 0) {
      const worker = this.#idle.shift()
      const job = this.#queue.shift()
      worker.job = job
      worker.postMessage({ id: job.id, data: job.data })
    }
  }
}
