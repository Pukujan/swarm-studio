// A command to run in Hermes, shown whole, with Copy beside it. The studio shows a command where Hermes is the
// one to act (a key, the MCP allowlist): the person runs it, so nothing secret passes through the page.
import { Button } from './Button'

export function Command({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-[8px] border border-edge px-3 py-2.5 font-monospace text-[13px] leading-none text-text">{cmd}</code>
      <Button role="ghost" onPress={() => { navigator.clipboard?.writeText(cmd).catch(() => {}) }}>Copy</Button>
    </div>
  )
}
