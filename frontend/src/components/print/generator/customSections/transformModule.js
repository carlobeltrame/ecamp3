import { babelParse, MagicString } from '@vue/compiler-sfc'

/**
 * Rewrites the import and export statements of an ES module so that the code can run
 * as the body of an async function with the parameters __import and __exports.
 */
export function transformModule(code) {
  const ast = babelParse(code, { sourceType: 'module' })
  const output = new MagicString(code)
  const exportStatements = []
  let moduleCount = 0

  const importModule = (source) => {
    const name = `__module${moduleCount++}`
    return [name, `const ${name} = await __import(${JSON.stringify(source)});`]
  }

  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      const [moduleName, statement] = importModule(node.source.value)
      const bindings = node.specifiers.map((specifier) => {
        if (specifier.type === 'ImportDefaultSpecifier') {
          return `const ${specifier.local.name} = ${moduleName}.default;`
        }
        if (specifier.type === 'ImportNamespaceSpecifier') {
          return `const ${specifier.local.name} = ${moduleName};`
        }
        return `const { ${exportedName(specifier.imported)}: ${specifier.local.name} } = ${moduleName};`
      })
      output.overwrite(node.start, node.end, [statement, ...bindings].join(' '))
    } else if (node.type === 'ExportDefaultDeclaration') {
      output.overwrite(node.start, node.declaration.start, '__exports.default = ')
    } else if (node.type === 'ExportAllDeclaration') {
      const [moduleName, statement] = importModule(node.source.value)
      output.overwrite(
        node.start,
        node.end,
        `${statement} Object.assign(__exports, ${moduleName});`
      )
    } else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      output.remove(node.start, node.declaration.start)
      declaredNames(node.declaration).forEach((name) =>
        exportStatements.push(`__exports.${name} = ${name};`)
      )
    } else if (node.type === 'ExportNamedDeclaration' && node.source) {
      const [moduleName, statement] = importModule(node.source.value)
      const assignments = node.specifiers.map(
        (specifier) =>
          `__exports[${JSON.stringify(exportedName(specifier.exported))}] = ${moduleName}[${JSON.stringify(exportedName(specifier.local))}];`
      )
      output.overwrite(node.start, node.end, [statement, ...assignments].join(' '))
    } else if (node.type === 'ExportNamedDeclaration') {
      node.specifiers.forEach((specifier) =>
        exportStatements.push(
          `__exports[${JSON.stringify(exportedName(specifier.exported))}] = ${specifier.local.name};`
        )
      )
      output.remove(node.start, node.end)
    }
  }

  return [output.toString(), ...exportStatements].join('\n')
}

function exportedName(node) {
  return node.type === 'StringLiteral' ? node.value : node.name
}

function declaredNames(declaration) {
  if (declaration.type !== 'VariableDeclaration') {
    return [declaration.id.name]
  }
  return declaration.declarations.map((declarator) => {
    if (declarator.id.type !== 'Identifier') {
      throw new Error('Exported variables must be declared with a plain name.')
    }
    return declarator.id.name
  })
}
