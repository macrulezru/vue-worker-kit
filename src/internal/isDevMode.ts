/**
 * Dev-mode check for diagnostic warnings that should run while developing
 * but stay silent in production. Deliberately reads `process.env.NODE_ENV`
 * instead of `import.meta.env.DEV`: this package ships as a pre-built
 * `dist/`, and `vite build` always runs in production mode with no dev-mode
 * flag of its own — `import.meta.env.DEV` would be statically replaced with
 * `false` at THIS package's own build time and baked into the shipped
 * bundle permanently, regardless of what mode a consuming app is actually
 * running in. `process.env.NODE_ENV` survives unreplaced into the shipped
 * dist and gets substituted correctly by the CONSUMING app's own bundler at
 * ITS build time instead.
 */
export function isDevMode(): boolean {
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
}
