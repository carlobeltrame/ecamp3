const REMOVED_GLOBALS = [
  'XMLHttpRequest',
  'WebSocket',
  'WebSocketStream',
  'WebTransport',
  'EventSource',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'RTCPeerConnection',
  'RTCDataChannel',
  'FontFace',
  'Notification',
  'importScripts',
  'indexedDB',
  'caches',
  'cookieStore',
]

const REMOVED_NAVIGATOR_PROPERTIES = [
  'sendBeacon',
  'serviceWorker',
  'storage',
  'locks',
  'usb',
  'hid',
  'serial',
]

let lockedDown = false

/**
 * Takes away the network and storage access of the current worker, so that section
 * code which was not reviewed cannot read from or write to the API or the browser storage.
 * Only static assets needed while laying out the PDF can still be fetched.
 */
export function lockdownWorker(scope = globalThis) {
  if (lockedDown) return
  if (typeof scope.WorkerGlobalScope === 'undefined') {
    throw new Error('Custom sections can only be rendered inside a web worker.')
  }

  const originalFetch = scope.fetch.bind(scope)
  const guardedFetch = (resource, options = {}) => {
    const url = new URL(
      resource instanceof Request ? resource.url : resource,
      scope.location.href
    )
    const method = (options.method ?? resource.method ?? 'GET').toUpperCase()
    if (method !== 'GET' || !isAllowedAsset(url, scope.location)) {
      return Promise.reject(new TypeError('Network access is not available here.'))
    }
    return originalFetch(url.href, { credentials: 'omit' })
  }

  replaceEverywhere(scope, 'fetch', guardedFetch)
  REMOVED_GLOBALS.forEach((name) => replaceEverywhere(scope, name, undefined))
  REMOVED_NAVIGATOR_PROPERTIES.forEach((name) =>
    replaceEverywhere(scope.navigator, name, undefined)
  )

  lockedDown = true
}

function isAllowedAsset(url, location) {
  if (url.protocol === 'data:') return true
  return url.origin === location.origin && url.pathname.startsWith('/twemoji/')
}

function replaceEverywhere(object, name, value) {
  for (let owner = object; owner; owner = Object.getPrototypeOf(owner)) {
    if (Object.prototype.hasOwnProperty.call(owner, name)) {
      Object.defineProperty(owner, name, {
        value,
        writable: false,
        configurable: false,
      })
    }
  }
}
