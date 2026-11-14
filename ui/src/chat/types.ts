// The chat's interface (docs/specs/27-plan-conversation.md, 29-chats-references-marks.md; decision 0015: a dock along
// the bottom of every screen that has one, never on the left): what a screen gives
// <Chat> and what it hears back. The Studio scaffold, the Overview and the Design deck all draw the same <Chat>
// (OBJECTS.md: **Chat**, a conversation with the planner; the code of the current Studio calls it the talk,
// web/canvas/talk.js). The chat owns its turns, the open question, the brief being edited, the chat's id, its tab,
// the chips in the message box and the two pickers. The screen owns what was built: the crew's lines, the Log, where
// each layer is on screen, and what Build, a slash command or a plan does next.

export type ChatKind = 'site' | 'app' | 'game' | 'film' | 'video'

// One line in the Chat or the Log tab. `at` orders the screen's lines among the chat's own turns.
export interface ChatLine {
  id: string
  at: number
  // you: the person; hermia: the planner; crew: an agent answering a comment; sys: the Log's build lines; err: a
  // line that something failed
  who: 'you' | 'hermia' | 'crew' | 'sys' | 'err'
  text: string
  // crew: the agent's name and colour
  name?: string
  color?: string
  // a small note after the text: the page and section it is about, or the chips a turn was sent with
  where?: string
  // the layers it is about: hovering the line draws their wires again (spec 29, "Drag a layer into the chat")
  layers?: string[]
  // Hermia is working on it (the dots)
  working?: boolean
}

// A chip in the message box: a layer dragged in (it gets a wire to the layer), or a reference (a picture, clip or
// sound dropped or pasted; no wire)
export interface ChatChip {
  key: string
  name: string
  kind: 'layer' | 'ref'
  thumb?: string
}

// A talk to start (talkStart in web/canvas/talk.js). A new `id` starts a new talk; `null` ends it, and the box
// goes back to building. Every field but `id` is optional.
export interface ChatTalk {
  id: string
  kind?: ChatKind
  // reopen this chat: its turns come back, and a game's open question with its options
  chat?: string | null
  // the turns to show first (an old chat opened from Projects)
  said?: { who: 'you' | 'hermia', text: string }[]
  // the person's first words, sent at once
  text?: string
  // a brief ready to read, edit and Build, with what Build makes (a showcase, or the Make box's prompt);
  // sheet: open the brand sheet on it at once
  brief?: string
  what?: string
  sheet?: boolean
  // a new project with nothing built yet: the canvas is empty (the screen clears it)
  blank?: boolean
}

// How Build goes from a brief: more for this project (add), a different product (new), or this one from scratch
// (redo: new pages and look, the old version stays in the project). Outside a project it is always add.
export type BuildRoute = 'add' | 'new' | 'redo'

// A slash command the screen understands (web/canvas/loop.js SLASH): its name, its argument and what it does
export interface ChatCommand {
  name: string
  arg?: string
  what: string
}

// A game chat's option, or where to start after the lock (server/talk.mjs): a chip under the open question
export interface ChatOption {
  id: string
  label: string
  why?: string
  focus?: string
  select?: string
}

// Where each part of the server lives, so a story can answer from a fixture: `api(path, init)` is fetch with the
// token (window.SWARM.token). Without it the chat uses its own (src/chat/api.ts).
export type ChatApi = (path: string, init?: RequestInit) => Promise<Response>

export interface ChatProps {
  // the talk going on, or none: then Send builds (onSubmit)
  talk?: ChatTalk | null
  // inside a project: the version shown (its run id), so a brief extends it; and the project, for Chats and media
  from?: string | null
  project?: string | null
  // the screen's own lines in the Chat tab (crew replies, a build's summary) and in the Log tab
  lines?: ChatLine[]
  log?: ChatLine[]
  // the slash commands this screen has (none: / is plain text)
  commands?: ChatCommand[]
  // the most agents a build may have (the hosted studio's limit); the picker offers 4 to 24
  agentsMax?: number
  // where a layer is on screen, for its wire: { left, top, width, height }, or null when it is not drawn
  layerRect?: (key: string) => DOMRectReadOnly | { left: number, top: number, width: number, height: number } | null
  api?: ChatApi

  // ---------- what the chat tells the screen
  // Send while no talk is on: a build (or, when it starts with /, a command), with the pickers' values and the
  // chips, which leave the box
  onSubmit?: (e: { text: string, agents: number, model: string, chips: ChatChip[] }) => void
  // a line that starts with / (one of `commands`, or not: the screen says what it does), sent from any state
  onCommand?: (e: { name: string, arg: string, text: string }) => void
  // the chat started a talk itself (Chats: a chat reopened, or New chat); blank: clear the canvas
  onTalk?: (talk: ChatTalk) => void
  // Build from a brief: the talk ends, and the screen builds it (route: see BuildRoute)
  onBuild?: (e: { brief: string, chat: string | null, route: BuildRoute, kind: ChatKind }) => void
  // the brief's Brand sheet: the screen opens it; it answers with the chat's id (made if there was none) and
  // whether the sheet was locked, and the button says so
  onBrandSheet?: (e: { chat: string | null, brief: string, kind: ChatKind }) => Promise<{ chat?: string | null, locked?: boolean } | void> | void
  // a game talk's plan as it stands (the board beside the chat draws it), the plan the lock made (open it), and a
  // start chip's part of the board
  onPlanDraft?: (draft: unknown) => void
  onPlan?: (plan: string) => void
  onPlanAt?: (plan: string, at: { focus?: string, select?: string }) => void
  // a loose chat that is not a website, picked in Chats: Projects knows how each kind builds
  onOpenChat?: (chat: { id: string, kind: ChatKind }) => void
  // the person answered the question before a website's build (docs/decisions/0020-ask-before-build.md): all builds
  // the brief now (the chat is answered); the others open the Studio walk from it with `skip` marked skipped
  onGo?: (e: ChatGo) => void
  // each line the person sends in a talk (the Studio takes its idea from the first)
  onHeard?: (text: string) => void
  // the build model picker's Other…: the screen opens the models panel
  onMoreModels?: () => void
}

// the answer to the question before a website's build (engine/askfirst.mjs): what the screen does next
export interface ChatGo { path: 'all' | 'steps' | 'skip-brand' | 'skip-plan', skip: string[], brief: string, chat: string }
