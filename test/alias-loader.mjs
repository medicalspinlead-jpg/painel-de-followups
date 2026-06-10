// Resolver hook para mapear o alias "@/..." (configurado no tsconfig) para a raiz do projeto.
// Também resolve extensões .ts quando o import não as especifica.
// Usado pelo runner nativo do Node: `node --import ./test/alias-loader.mjs --test`
import { pathToFileURL } from "node:url"
import { resolve as resolvePath } from "node:path"
import { existsSync } from "node:fs"

const ROOT = process.cwd()
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"]

function resolveWithExtension(absPath) {
  if (existsSync(absPath)) return absPath
  for (const ext of EXTENSIONS) {
    if (existsSync(absPath + ext)) return absPath + ext
  }
  for (const ext of EXTENSIONS) {
    const indexFile = resolvePath(absPath, `index${ext}`)
    if (existsSync(indexFile)) return indexFile
  }
  return absPath
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = resolveWithExtension(resolvePath(ROOT, specifier.slice(2)))
    return nextResolve(pathToFileURL(target).href, context)
  }
  return nextResolve(specifier, context)
}
