import { renderPdfInWorker as render } from './renderPdfInWorker.js'

export const renderPdfInWorker = (data, onProgress) => render(data, onProgress)

if (import.meta.hot) {
  // Since no file directly imports this file (only via a Worker constructor), we need to tell
  // vite that it does not have to reload the full page when something changes in the worker.
  import.meta.hot.accept(() => {})
}
