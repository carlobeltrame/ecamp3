import { describe, expect, it } from 'vitest'
import { transformModule } from '../transformModule.js'

const AsyncFunction = (async () => {}).constructor

async function run(code, modules = {}) {
  const exports = {}
  await new AsyncFunction('__import', '__exports', transformModule(code))(
    async (specifier) => modules[specifier],
    exports
  )
  return exports
}

describe('transformModule', () => {
  it('provides default, named, renamed and namespace imports', async () => {
    const exports = await run(
      `import a, { b, c as renamed } from 'one'
       import * as two from 'two'
       export default [a, b, renamed, two.d]`,
      { one: { default: 1, b: 2, c: 3 }, two: { d: 4 } }
    )

    expect(exports.default).toEqual([1, 2, 3, 4])
  })

  it('collects default and named exports', async () => {
    const exports = await run(
      `export const one = 1, two = 2
       export function three() { return 3 }
       const four = 4
       export { four, four as vier }
       export default class Five {}`
    )

    expect(exports.one).toBe(1)
    expect(exports.two).toBe(2)
    expect(exports.three()).toBe(3)
    expect(exports.four).toBe(4)
    expect(exports.vier).toBe(4)
    expect(exports.default.name).toBe('Five')
  })

  it('re-exports from other modules', async () => {
    const exports = await run(
      `export { a as b } from 'one'
       export * from 'two'`,
      { one: { a: 1 }, two: { c: 2 } }
    )

    expect(exports).toEqual({ b: 1, c: 2 })
  })

  it('leaves import-like text inside strings alone', async () => {
    const exports = await run(`export default "import x from 'y'"`)

    expect(exports.default).toBe("import x from 'y'")
  })
})
