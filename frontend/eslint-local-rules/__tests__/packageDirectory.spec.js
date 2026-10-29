import { afterEach, describe, expect, it } from 'vitest'
import { packageDirectory } from '../packageDirectory.js'
import path from 'path'
import fs from 'fs'
import os from 'os'

describe('packageDirectory', () => {
  let tempDirectory

  afterEach(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true })
  })

  it('resolves the location of the closest package.json', () => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'packageDirectory-'))
    const nestedDirectory = path.join(tempDirectory, 'src', 'components')
    fs.mkdirSync(nestedDirectory, { recursive: true })
    fs.writeFileSync(path.join(tempDirectory, 'package.json'), '{}')

    expect(packageDirectory(path.join(nestedDirectory, 'Component.vue'))).toEqual(
      tempDirectory
    )
  })
})
