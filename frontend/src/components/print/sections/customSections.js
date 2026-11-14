import { reactive } from 'vue'

const STORAGE_KEY = 'printCustomSections'

function load() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function persist() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customSections))
}

/**
 * The sections which the print assistant wrote for this user, by id.
 * Each has the shape { id, title, description, options, files }.
 */
export const customSections = reactive(load())

export function saveCustomSection(section) {
  customSections[section.id] = section
  persist()
}

export function deleteCustomSection(id) {
  delete customSections[id]
  persist()
}
