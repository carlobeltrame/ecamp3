import { beforeEach, describe, expect, it, vi } from 'vitest'

function createWorkerScope() {
  const prototype = {
    fetch: vi.fn(async () => 'response'),
    XMLHttpRequest: class {},
    importScripts: () => {},
  }
  const navigator = Object.create({ sendBeacon: () => true, serviceWorker: {} })
  return Object.assign(Object.create(prototype), {
    WorkerGlobalScope: class {},
    WebSocket: class {},
    indexedDB: {},
    navigator,
    location: new URL('https://ecamp.example/assets/worker.js'),
    originalFetch: prototype.fetch,
  })
}

describe('lockdownWorker', () => {
  let lockdownWorker

  beforeEach(async () => {
    vi.resetModules()
    lockdownWorker = (await import('../lockdownWorker.js')).lockdownWorker
  })

  it('refuses to run outside of a worker', () => {
    expect(() => lockdownWorker({ fetch: () => {} })).toThrow(/web worker/)
  })

  it('removes network and storage APIs, also from the prototype chain', () => {
    const scope = createWorkerScope()

    lockdownWorker(scope)

    expect(scope.XMLHttpRequest).toBeUndefined()
    expect(scope.importScripts).toBeUndefined()
    expect(scope.WebSocket).toBeUndefined()
    expect(scope.indexedDB).toBeUndefined()
    expect(scope.navigator.sendBeacon).toBeUndefined()
    expect(scope.navigator.serviceWorker).toBeUndefined()
  })

  it('does not allow restoring the removed APIs', () => {
    const scope = createWorkerScope()

    lockdownWorker(scope)

    expect(() => {
      'use strict'
      scope.fetch = scope.originalFetch
    }).toThrow()
  })

  it.each([
    ['/api/camps', {}],
    ['https://evil.example/twemoji/1.png', {}],
    ['/twemoji/assets/72x72/1f600.png', { method: 'POST' }],
  ])('blocks fetching %s', async (url, options) => {
    const scope = createWorkerScope()

    lockdownWorker(scope)

    await expect(scope.fetch(url, options)).rejects.toThrow(/Network access/)
    expect(scope.originalFetch).not.toHaveBeenCalled()
  })

  it('still fetches emoji images, without credentials', async () => {
    const scope = createWorkerScope()

    lockdownWorker(scope)

    await expect(scope.fetch('/twemoji/assets/72x72/1f600.png')).resolves.toBe('response')
    expect(scope.originalFetch).toHaveBeenCalledWith(
      'https://ecamp.example/twemoji/assets/72x72/1f600.png',
      { credentials: 'omit' }
    )
  })
})
