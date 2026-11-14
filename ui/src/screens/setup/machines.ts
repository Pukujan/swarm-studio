// The two sheets' layers (layers.ts) as XState machines: what each named action and guard does.
import { assign, setup } from 'xstate'
import { SETTINGS_LAYERS, SETUP_LAYERS } from './layers'

export type SetupRow = '' | 'account' | 'models' | 'pictures' | 'parts'
export type SetupEvent =
  | { type: 'row', k: SetupRow }
  | { type: 'parts' }
  | { type: 'group', k: string }
  | { type: 'part', k: string }
  | { type: 'up' }

export const setupMachine = setup({
  types: {} as { context: { row: SetupRow, group: string, part: string }, events: SetupEvent, input: { row?: SetupRow, group?: string, part?: string } },
  guards: {
    startsOnParts: ({ context }) => context.row === 'parts',
    startsOnGroup: ({ context }) => context.row === 'parts' && !!context.group,
    startsOnPart: ({ context }) => context.row === 'parts' && !!context.group && !!context.part,
    sameGroup: ({ context, event }) => event.type === 'group' && event.k === context.group,
    samePart: ({ context, event }) => event.type === 'part' && event.k === context.part
  },
  actions: {
    toggleRow: assign({ row: ({ context, event }) => (event.type === 'row' && event.k !== context.row ? event.k : '') }),
    shutRow: assign({ row: '' }),
    setGroup: assign({ group: ({ event }) => (event.type === 'group' ? event.k : ''), part: '' }),
    shutGroup: assign({ group: '', part: '' }),
    setPart: assign({ part: ({ event }) => (event.type === 'part' ? event.k : '') }),
    shutPart: assign({ part: '' })
  }
}).createMachine({ ...SETUP_LAYERS, context: ({ input }) => ({ row: input.row ?? '', group: input.group ?? '', part: input.part ?? '' }) })

export type SettingsEvent = { type: 'you' | 'lite' | 'data' | 'up' | 'goes' }

export const settingsMachine = setup({
  types: {} as { context: { goes: boolean }, events: SettingsEvent },
  actions: {
    toggleGoes: assign({ goes: ({ context }) => !context.goes }),
    shutGoes: assign({ goes: false })
  }
}).createMachine({ ...SETTINGS_LAYERS, context: { goes: false } })
