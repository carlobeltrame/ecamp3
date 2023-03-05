import { vi } from 'vitest'

export const debounce = vi.fn().mockImplementation(function (callback, _) {
  let timer
  return function (...args) {
    clearTimeout(timer)
    const argsCopy = [].slice.call(args)
    timer = setTimeout(() => {
      callback.apply(this, argsCopy)
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
