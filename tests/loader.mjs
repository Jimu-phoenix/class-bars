import { pathToFileURL } from "node:url"
import { existsSync } from "node:fs"

const SRC_URL = new URL("../src/", import.meta.url)
const MOCK_SUPABASE_URL = "mock://class-bars/supabase"

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/supabase") {
    return { url: MOCK_SUPABASE_URL, shortCircuit: true }
  }
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2)
    let target = new URL(rel, SRC_URL)
    if (!existsSync(target)) {
      target = new URL(`${rel}.ts`, SRC_URL)
    }
    return { url: pathToFileURL(target.href).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url === MOCK_SUPABASE_URL) {
    const source = "const supabase = globalThis.__MOCK_SUPABASE__\nexport { supabase }\n"
    return { format: "module", source, shortCircuit: true }
  }
  return nextLoad(url, context)
}
