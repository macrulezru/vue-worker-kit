import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const ENTRY_POINTS: Record<string, string> = {
  '.': 'src/index.ts',
  './worker': 'src/worker/defineWorkerHandler.ts',
  './pool': 'src/adapters/pool.ts',
  './computed': 'src/adapters/computed.ts',
  './shared': 'src/adapters/sharedWorker.ts',
  './devtools': 'src/devtools/index.ts',
}

const referencePath = resolve(
  root,
  process.env.VWK_AI_REFERENCE ?? '../../npm-center/packages/vue-worker-kit/ai-reference.txt',
)

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function exportedNames(source: string): string[] {
  const text = stripComments(source)
  const names = new Set<string>()

  for (const match of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const cleaned = part.trim().replace(/^type\s+/, '')
      if (!cleaned) continue
      const alias = cleaned
        .split(/\s+as\s+/)
        .pop()!
        .trim()
      names.add(alias)
    }
  }

  for (const match of text.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1])
  }

  names.delete('default')
  return Array.from(names).sort()
}

describe('documentation drift', () => {
  test('every package.json subpath export has a known entry file', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>
    }
    expect(Object.keys(pkg.exports).sort()).toEqual(Object.keys(ENTRY_POINTS).sort())
  })

  test('the symbol extractor sees the public API', () => {
    const names = exportedNames(readFileSync(resolve(root, ENTRY_POINTS['.']), 'utf8'))
    expect(names).toContain('useWorker')
    expect(names).toContain('WorkerError')
    expect(names).toContain('RunOptions')
  })

  const referenceExists = existsSync(referencePath)
  const inCi = Boolean(process.env.CI)

  if (!referenceExists && inCi) {
    console.warn(
      `[docs drift] AI reference not found at ${referencePath} — skipped in CI. ` +
        'It is mandatory locally before publishing: set VWK_AI_REFERENCE to the file path.',
    )
  }

  test.skipIf(!referenceExists && inCi)(
    'every exported symbol of every entry point is mentioned in the AI reference',
    () => {
      if (!referenceExists) {
        throw new Error(
          `AI reference not found at ${referencePath}. Point VWK_AI_REFERENCE at ` +
            'packages/vue-worker-kit/ai-reference.txt of the documentation site repository.',
        )
      }
      const reference = readFileSync(referencePath, 'utf8')
      const missing: string[] = []
      for (const [subpath, file] of Object.entries(ENTRY_POINTS)) {
        const names = exportedNames(readFileSync(resolve(root, file), 'utf8'))
        for (const name of names) {
          const mentioned = new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(
            reference,
          )
          if (!mentioned) missing.push(`${subpath}: ${name}`)
        }
      }
      expect(missing, 'symbols exported by the package but absent from ai-reference.txt').toEqual(
        [],
      )
    },
  )
})
