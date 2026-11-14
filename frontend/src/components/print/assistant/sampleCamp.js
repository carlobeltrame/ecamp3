import wrap from '../generator/minimalHalJsonVuex.js'

export const SAMPLE_CAMP_URI = '/camps/246368fc3a1a'

let sampleStore = null

/**
 * The store content of a fictional camp, in the shape of the API store module.
 */
export async function loadSampleStore() {
  sampleStore ??= (await import('./sampleCamp.json')).default
  return sampleStore
}

export async function loadSampleCamp() {
  return wrap(await loadSampleStore()).get(SAMPLE_CAMP_URI)
}
