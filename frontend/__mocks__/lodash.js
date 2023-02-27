import { vi } from 'vitest'

export const debounce = vi.fn().mockImplementation(function (callback, delay) {
  let timer
  return function (...args) {
    clearTimeout(timer)
    var args = [].slice.call(arguments)
    timer = setTimeout(() => {
      callback.apply(this, args)
    }, 100)
  }
})

export const get = vi.fn().mockImplementation(function (object, path) {
  return object[path]
})

export const set = vi.fn().mockImplementation(function (object, path, value) {
  object[path] = value
  return object
})
