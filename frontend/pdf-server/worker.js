import { parentPort, workerData } from 'node:worker_threads'

const { warmUp, renderPdf } = await import(workerData.entryUrl)
await warmUp({ publicDir: workerData.publicDir })

parentPort.on('message', async ({ id, data }) => {
  try {
    const pdf = await renderPdf(data, async (state, params) => {
      parentPort.postMessage({ id, progress: { state, params } })
    })
    parentPort.postMessage({ id, pdf }, [pdf.buffer])
  } catch (error) {
    parentPort.postMessage({ id, error: { message: error.message, stack: error.stack } })
  }
})

parentPort.postMessage({ ready: true })
