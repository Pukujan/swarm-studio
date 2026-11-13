// Where the person is inside Setup and Settings: the layers of docs/ux/statechart/studio.machine.js
// (`#projects.setup`: index → parts → group → part, each `up` one level; `#me.settings`: index, then one of its
// rows). The live machine (web/nav.js) has no state for either sheet, so each sheet runs these layers as its own
// small machine (machines.ts). Plain config with named actions and guards, no imports, so
// tests/next-setup.test.mjs reads it beside the statechart and checks the names agree.
//
// Setup's rows are one open at a time, as in web/setup.js: Account, Models and Pictures open in `index`
// (context.row); the Parts row open is `parts`, a group open in it is `group`, a part open in that is `part`.

export const SETUP_LAYERS = {
  id: 'setup',
  initial: 'index',
  states: {
    index: {
      // opened on Parts (Settings › Setup), or on one group or part of it (a story): straight there
      always: [
        { guard: 'startsOnPart', target: 'part', actions: 'shutRow' },
        { guard: 'startsOnGroup', target: 'group', actions: 'shutRow' },
        { guard: 'startsOnParts', target: 'parts', actions: 'shutRow' }
      ],
      on: { row: { actions: 'toggleRow' }, parts: { target: 'parts', actions: 'shutRow' } }
    },
    parts: {
      on: { up: 'index', parts: 'index', row: { target: 'index', actions: 'toggleRow' }, group: { target: 'group', actions: 'setGroup' } }
    },
    group: {
      on: {
        up: { target: 'parts', actions: 'shutGroup' },
        parts: { target: 'index', actions: 'shutGroup' },
        row: { target: 'index', actions: ['shutGroup', 'toggleRow'] },
        group: [{ guard: 'sameGroup', target: 'parts', actions: 'shutGroup' }, { actions: 'setGroup' }],
        part: { target: 'part', actions: 'setPart' }
      }
    },
    part: {
      on: {
        up: { target: 'group', actions: 'shutPart' },
        parts: { target: 'index', actions: 'shutGroup' },
        row: { target: 'index', actions: ['shutGroup', 'toggleRow'] },
        group: [{ guard: 'sameGroup', target: 'parts', actions: 'shutGroup' }, { target: 'group', actions: 'setGroup' }],
        part: [{ guard: 'samePart', target: 'group', actions: 'shutPart' }, { actions: 'setPart' }]
      }
    }
  }
} as const

export const SETTINGS_LAYERS = {
  id: 'settings',
  initial: 'index',
  states: {
    // Setup is a row here too, but it is not a layer: Settings closes and the Setup sheet opens on its Parts
    // (the statechart's `setup: '#projects.setup.parts'`), which the sheets' provider does
    index: { on: { you: 'you', lite: 'lite', data: 'data' } },
    you: { entry: 'shutGoes', on: { up: 'index', goes: { actions: 'toggleGoes' } } },
    lite: { on: { up: 'index' } },
    data: { on: { up: 'index' } }
  }
} as const
