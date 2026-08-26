import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const distDirectory = path.join(root, 'dist')
const outputDirectory = path.join(root, 'standalone')
const outputPath = path.join(outputDirectory, 'DOUBLE-CLICK TO OPEN - LOGO AVATAR.html')

let html = await fs.readFile(path.join(distDirectory, 'index.html'), 'utf8')

const scriptMatch = html.match(/<script type="module" crossorigin src="\.\/(.*?)"><\/script>/)
const styleMatch = html.match(/<link rel="stylesheet" crossorigin href="\.\/(.*?)">/)

if (!scriptMatch || !styleMatch) {
  throw new Error('Could not locate the production JavaScript and stylesheet in dist/index.html.')
}

const [script, stylesheet, favicon] = await Promise.all([
  fs.readFile(path.join(distDirectory, scriptMatch[1]), 'utf8'),
  fs.readFile(path.join(distDirectory, styleMatch[1]), 'utf8'),
  fs.readFile(path.join(distDirectory, 'favicon.svg'), 'utf8'),
])

const faviconData = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`

html = html
  .replace(
    scriptMatch[0],
    `<script type="module">${script.replaceAll('</script', '<\\/script')}</script>`
  )
  .replace(styleMatch[0], `<style>${stylesheet.replaceAll('</style', '<\\/style')}</style>`)
  .replace('./favicon.svg', faviconData)
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/\s*<link rel="manifest"[^>]*>/, '')

await fs.mkdir(outputDirectory, { recursive: true })
await fs.writeFile(outputPath, html)

console.log(`Created ${path.relative(root, outputPath)} (${Buffer.byteLength(html)} bytes)`)
