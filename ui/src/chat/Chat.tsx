// The left chat: Chat, Log and Chats, Hermia's turns, the chips, the pickers and Send. Its props and events are
// src/chat/types.ts. Work in progress (issue #404): this is the interface the Studio scaffold, Overview and Design
// deck ports code against; the talk itself follows on this branch.
import type { ChatProps } from './types'

export function Chat(_props: ChatProps) {
  return <aside className="side" aria-label="Chat" />
}
