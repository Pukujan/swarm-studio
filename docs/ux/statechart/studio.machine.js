// The Studio's statechart: every screen in docs/ux/SITEMAP.md and the moves between them, as one
// XState v5 machine (docs/PLANS.md §5, the second design artifact). docs/ux/statechart/README.md
// explains it. It is a design artifact, not the app: the live navigation machine is web/nav.js
// (docs/specs/34-navigation-state.md), and the README lists where the two differ.
//
// To view it: paste this file into https://stately.ai/viz, or Stately Studio › Import from code. The
// config is one literal object on purpose (no helpers, no spreads), so a static import reads all of it.
//
// Every state carries:
//   description  one line, shown by Stately
//   meta.sitemap the SITEMAP nodes that live on this screen, as '<section heading> › <node label>',
//                each copied verbatim (tests/statechart.test.mjs checks both ways)
//   meta.live    the matching state of web/nav.js, or null when the live machine has none
//   meta.owner   'feed' (Swarm Feed's code), 'studio' (this plugin) or 'hosted' (/studio/app)
//
// Two events are the way home (docs/ux/RULES.md rule 7): `home` (the logo, and the Home slot) from
// anywhere, and `up` (Esc) one level up from every screen. An open panel answers Esc first with
// `close`; `up` is Esc with nothing open.
import { setup, assign } from '../../../web/vendor/xstate/xstate.mjs'

const id = v => (typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : null)

export const studioMachine = setup({
  guards: {
    hasBuild: ({ event }) => !!(id(event.version) || id(event.project)),
    hasRun: ({ event }) => !!id(event.run),
    hasProject: ({ event }) => !!id(event.project),
    lensJustMake: ({ event }) => (event.lens || 'just') === 'just',
    lensDesign: ({ event }) => event.lens === 'design',
    lensDevelop: ({ event }) => event.lens === 'develop',
    lensGame: ({ event }) => event.lens === 'game',
    lensLaunch: ({ event }) => event.lens === 'launch',
    lensMix: ({ event }) => event.lens === 'mix',
    fromScaffold: ({ context }) => context.from === 'scaffold',
    fromPlan: ({ context }) => context.from === 'plan',
    fromDraft: ({ context }) => context.from === 'draft',
    fromBuild: ({ context }) => context.from === 'build' && !!context.version,
    playerClosed: ({ context }) => !context.playing
  },
  actions: {
    openBuild: assign({ project: ({ event }) => id(event.project), version: ({ event }) => id(event.version), run: ({ event }) => id(event.version), page: null }),
    startRun: assign({ version: ({ event }) => id(event.run), run: ({ event }) => id(event.run), pending: ({ event }) => id(event.run), page: null }),
    openGame: assign({ run: ({ event }) => id(event.run), page: null }),
    setLens: assign({ lens: ({ event }) => event.lens || 'just' }),
    rememberFrom: assign({ from: ({ event }) => event.from || null }),
    forgetFrom: assign({ from: null }),
    clearPending: assign({ pending: ({ context, event }) => (context.pending && event.run === context.pending ? null : context.pending) }),
    playerOpen: assign({ playing: true }),
    playerShut: assign({ playing: false, page: null }),
    pickPage: assign({ page: ({ context, event }) => id(event.page) || context.page })
  }
}).createMachine({
  id: 'studio',
  description: 'Swarm: Hermes opens the Feed on Home; the Studio is inside it, through + Create and Projects',
  context: { project: null, version: null, run: null, plan: null, page: null, pending: null, from: null, lens: 'just', playing: false },
  initial: 'feed',
  on: {
    // the five slots of the nav (SITEMAP §2), always there; the logo is `home`
    home: { target: '#feedHome' },
    discover: { target: '#discover' },
    create: { target: '#create' },
    projects: { target: '#projects' },
    me: { target: '#me' },
    // the moves the live machine already has, from every state (spec 34)
    'open.project': { guard: 'hasBuild', target: '#overview', actions: 'openBuild' },
    started: { guard: 'hasRun', target: '#deck', actions: 'startRun' },
    draft: { target: '#draft' },
    plan: { target: '#planBoard' },
    brand: { target: '#brandSheet', actions: 'rememberFrom' },
    studio: { guard: 'hasProject', target: '#scaffold' },
    streamed: { actions: 'clearPending' }
  },
  states: {
    feed: {
      description: 'The Swarm Feed: one build per screen, swipe for the next',
      meta: { owner: 'feed', live: null, sitemap: ['1. The whole product › Swarm Feed', '2. Navigation › Swarm: opens on Home'] },
      initial: 'home',
      on: { 'try.hosted': { target: '#hosted' } },
      states: {
        home: {
          id: 'feedHome',
          description: 'Home: For you, Following, Live',
          meta: { owner: 'feed', live: null, sitemap: ['1. The whole product › Home', '3. Home › Home'] },
          initial: 'forYou',
          on: { 'tab.forYou': '.forYou', 'tab.following': '.following', 'tab.live': '.live' },
          states: {
            forYou: {
              description: 'A build, full screen, playing itself; the right rail; Remix',
              meta: { owner: 'feed', live: null, sitemap: ['3. Home › For you', '3. Home › A build, full screen', '3. Home › Right rail', '3. Home › Talk', '3. Home › Share', '3. Home › Remix (the main button)'] },
              on: {
                swipe: { target: 'forYou', reenter: true },
                assets: { target: '#feedAssets' },
                story: { target: '#feedStory' },
                remix: { target: '#create' },
                suggest: { target: '#feedSuggest' },
                maker: { target: '#profile' }
              }
            },
            following: {
              description: 'Builds from makers you follow, the same full-screen player',
              meta: { owner: 'feed', live: null, sitemap: [] },
              on: { assets: { target: '#feedAssets' }, story: { target: '#feedStory' }, remix: { target: '#create' } }
            },
            live: {
              description: 'Crews building right now',
              meta: { owner: 'feed', live: null, sitemap: ['3. Home › Live', '3. Home › A crew building right now'] },
              on: { watch: { target: '#liveCanvas' } }
            }
          }
        },
        assets: {
          id: 'feedAssets',
          description: "A build's assets: pages, sprites and art, clips, palette and type",
          meta: { owner: 'feed', live: null, sitemap: ['3. Home › Swipe left: its assets', '3. Home › Sprites and art'] },
          on: { up: { target: '#feedHome' }, asset: { target: 'asset' } }
        },
        asset: {
          description: 'One asset, full size; Use it starts + Create from it',
          meta: { owner: 'feed', live: null, sitemap: ['3. Home › One asset, full size'] },
          on: { up: { target: 'assets' }, use: { target: '#create' } }
        },
        story: {
          id: 'feedStory',
          description: "A build's story: chapters, time-lapse, credits, remix chain",
          meta: { owner: 'feed', live: null, sitemap: ['3. Home › Tap: its story', '3. Home › Chapters as frames', '3. Home › Before and after'] },
          on: { up: { target: '#feedHome' } }
        },
        suggest: {
          id: 'feedSuggest',
          description: 'A remix suggested back to the maker',
          meta: { owner: 'feed', live: null, sitemap: ['3. Home › Or suggest it back to the maker'] },
          on: { up: { target: '#feedHome' }, sent: { target: '#feedHome' } }
        },
        liveCanvas: {
          id: 'liveCanvas',
          description: "A live crew's canvas, read only",
          meta: { owner: 'feed', live: null, sitemap: ['3. Home › A crew building right now'] },
          on: { up: { target: '#feedHome.live' } }
        }
      }
    },

    discover: {
      id: 'discover',
      description: 'Discover: search, makers, open boards, jams and events',
      meta: { owner: 'feed', live: null, sitemap: ['4. Discover › Discover'] },
      initial: 'index',
      states: {
        index: {
          description: 'The four ways in',
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › Jams and events'] },
          on: { up: { target: '#feedHome' }, search: 'search', makers: 'makers', boards: 'openBoards', jams: 'jams', events: 'events' }
        },
        search: {
          description: 'Search builds, assets and packs',
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › Search', '4. Discover › Packs', '4. Discover › Sites, apps, games'] },
          on: { up: 'index', pack: 'pack' }
        },
        pack: {
          description: 'A pack: preview, Use it',
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › A pack'] },
          on: { up: 'search', use: { target: '#create' } }
        },
        makers: {
          description: 'Makers',
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › Makers'] },
          on: { up: 'index', profile: 'profile' }
        },
        profile: {
          id: 'profile',
          description: "A maker's profile: showcase, credits, story, Follow",
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › A profile'] },
          on: { up: 'makers' }
        },
        openBoards: {
          description: 'Open boards looking for people',
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › Open boards'] },
          on: { up: 'index', board: 'openBoard' }
        },
        openBoard: {
          description: 'An open board: wanted roles, Ask to join',
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › An open board', '4. Discover › Ask to join'] },
          on: { up: 'openBoards', accepted: { target: '#board' } }
        },
        jams: {
          description: "Jams: this week's, past winners, host one",
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › Jams'] },
          on: { up: 'index', jam: 'jam', host: 'hostJam' }
        },
        jam: {
          description: "This week's jam: theme, entries, vote, Join",
          meta: { owner: 'feed', live: null, sitemap: ["4. Discover › This week's jam"] },
          on: { up: 'jams', join: { target: '#create' } }
        },
        hostJam: {
          description: 'Host a jam: theme, rules, dates',
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › Host a jam'] },
          on: { up: 'jams' }
        },
        events: {
          description: 'Events: live build sessions, meetups, host one',
          meta: { owner: 'feed', live: null, sitemap: ['4. Discover › Events', '4. Discover › Live build sessions'] },
          on: { up: 'index', watch: { target: '#liveCanvas' } }
        }
      }
    },

    create: {
      id: 'create',
      description: '+ Create: the one way to start a build',
      meta: { owner: 'feed', live: null, sitemap: ['1. The whole product › + Create', '2. Navigation › + Create', '5. + Create › + Create'] },
      initial: 'idea',
      states: {
        idea: {
          description: 'Hermia and one input; Start from; the lens chip',
          meta: {
            owner: 'feed',
            live: null,
            sitemap: ['5. + Create › Hermia and one input: the idea', '5. + Create › Start from (optional)', '5. + Create › Lens chip, guessed from the idea', '5. + Create › Just make it', '5. + Create › Design', '5. + Create › Develop', '5. + Create › Game', '5. + Create › Launch', '5. + Create › Design + Develop']
          },
          on: {
            up: { target: '#feedHome' },
            make: [
              { guard: 'lensGame', target: 'planQuestions', actions: 'setLens' },
              { guard: 'lensDesign', target: '#deck', actions: 'setLens' },
              { guard: 'lensMix', target: '#deck', actions: 'setLens' },
              { guard: 'lensDevelop', target: '#engineRoom', actions: 'setLens' },
              { guard: 'lensLaunch', target: '#launchPad', actions: 'setLens' },
              { guard: 'lensJustMake', target: 'progress', actions: 'setLens' }
            ]
          }
        },
        progress: {
          description: 'Just make it: the progress ring while the crew works',
          meta: { owner: 'feed', live: null, sitemap: ['5. + Create › Progress ring'] },
          on: { up: 'idea', done: 'result', stop: 'idea' }
        },
        result: {
          description: 'The result card: open its canvas, or post it',
          meta: { owner: 'feed', live: null, sitemap: ['5. + Create › Result card'] },
          on: { up: { target: '#feedHome' }, open: { target: '#overview' }, post: { target: '#share' } }
        },
        planQuestions: {
          description: "A game's plan questions, before the plan board",
          meta: { owner: 'studio', live: null, sitemap: ['5. + Create › Plan questions'] },
          on: { up: 'idea', answered: { target: '#planBoard' } }
        }
      }
    },

    projects: {
      id: 'projects',
      description: "Projects: a file browser, the studio's own home",
      meta: { owner: 'studio', live: 'home', sitemap: ['1. The whole product › Projects', '1. The whole product › Projects: a file browser', '2. Navigation › Projects', '6. Projects › Projects: a file browser'] },
      initial: 'browser',
      states: {
        browser: {
          description: 'Recent, All projects, Chats, Assets, Trash, Folders; the cards',
          meta: { owner: 'studio', live: 'home', sitemap: ['6. Projects › Recent, All projects', '6. Projects › A card: picture, title, kind icons'] },
          on: { up: { target: '#feedHome' }, make: 'make', setup: 'setup', boards: 'boards', moods: 'moodBoards', shared: 'shared' }
        },
        make: {
          description: 'What should the crew build? Make, the kind menu, Studio first',
          meta: {
            owner: 'studio',
            live: 'home',
            sitemap: ['6. Projects › What should the crew build? → Make', '6. Projects › Kind menu: Website, App, Game, Video, Brand, Deck, Pictures ›', '5c. The Studio\'s scaffold (spec 37) › Make › Studio', '5b. The Plan board (spec 21) › 💡 → a template: Remix']
          },
          // the two ways of making (decision 0020): Just make it, and the Studio. The question before a new
          // website's build is asked in the chat, on the deck
          on: {
            up: 'browser',
            'way.just': { guard: 'hasRun', target: '#deck', actions: 'startRun' },
            'way.studio': { guard: 'hasProject', target: '#scaffold' }
          }
        },
        setup: {
          description: 'Setup: once, then from the user menu (spec 6)',
          meta: { owner: 'studio', live: null, sitemap: ['6. Projects › Setup: once, then the user menu (spec 6)'] },
          initial: 'index',
          states: {
            index: {
              description: 'The rows: Account, Models, Pictures, Parts',
              meta: { owner: 'studio', live: null, sitemap: [] },
              on: { up: '#projects.browser', start: '#projects.browser', parts: 'parts' }
            },
            parts: {
              description: 'Parts (web/setup-parts.js): the groups by what you make, each n of m',
              meta: { owner: 'studio', live: null, sitemap: ['6. Projects › Parts: n of m, ⚠ when one fails'] },
              on: { up: 'index', group: 'group' }
            },
            group: {
              description: 'One group: its parts, each a dot, a name and a state',
              meta: { owner: 'studio', live: null, sitemap: ['6. Projects › Every build, Website, App, Game, Video, Brand, Deck, Publishing, Feed: n of m each'] },
              on: { up: 'parts', part: 'part' }
            },
            part: {
              description: 'One part: what it is for, what powers it, required or optional, what stops without it, its one fix',
              meta: { owner: 'studio', live: null, sitemap: ['6. Projects › A part: a dot (working, not set up, installs on first use) or ⚠, its name and state'] },
              on: { up: 'group' }
            }
          }
        },
        boards: {
          description: 'Boards you are on, Host a board',
          meta: { owner: 'studio', live: null, sitemap: ['6. Projects › Boards'] },
          on: { up: 'browser', board: 'board', host: 'hostBoard' }
        },
        hostBoard: {
          description: 'Host a board: cover, wanted roles, who can see it',
          meta: { owner: 'studio', live: null, sitemap: ['6. Projects › Host a board'] },
          on: { up: 'boards' }
        },
        board: {
          id: 'board',
          description: 'A board: builds, people, idea pins, activity',
          meta: { owner: 'studio', live: null, sitemap: ['6. Projects › A board', '6. Projects › People', '6. Projects › Idea pins'] },
          on: { up: 'boards', pin: 'pin' }
        },
        pin: {
          description: 'A pin on a spot: reply, accept, Build it',
          meta: { owner: 'studio', live: null, sitemap: ['6. Projects › A pin on a spot'] },
          on: { up: 'board', build: { target: '#create' } }
        },
        moodBoards: {
          description: 'Mood boards',
          meta: { owner: 'studio', live: null, sitemap: ['6. Projects › Mood boards'] },
          on: { up: 'browser', board: 'moodBoard' }
        },
        moodBoard: {
          description: 'A mood board: Start from it',
          meta: { owner: 'studio', live: null, sitemap: ['6. Projects › A mood board'] },
          on: { up: 'moodBoards', start: { target: '#create' } }
        },
        shared: {
          description: 'Builds and boards you were invited to',
          meta: { owner: 'studio', live: null, sitemap: ['6. Projects › Shared with me'] },
          on: { up: 'browser' }
        }
      }
    },

    me: {
      id: 'me',
      description: 'Me: profile, Launch, notifications, settings',
      meta: { owner: 'feed', live: null, sitemap: ['7. Me › Me'] },
      initial: 'index',
      states: {
        index: {
          description: 'The four ways in',
          meta: { owner: 'feed', live: null, sitemap: [] },
          on: { up: { target: '#feedHome' }, profile: 'profile', launch: 'launch', notifications: 'notifications', settings: 'settings' }
        },
        profile: {
          description: 'My profile: showcase, credits, story, followers',
          meta: { owner: 'feed', live: null, sitemap: ['7. Me › My profile'] },
          on: { up: 'index' }
        },
        notifications: {
          description: 'Requests, credits to confirm, suggested changes',
          meta: { owner: 'feed', live: null, sitemap: ['7. Me › Notifications'] },
          on: { up: 'index' }
        },
        launch: {
          description: 'Launch: each build with its posts, promo video and stats',
          meta: { owner: 'feed', live: null, sitemap: ['7. Me › Launch', '7. Me › A build'] },
          on: { up: 'index', 'open.launch': { guard: 'hasBuild', target: '#launchPad', actions: 'openBuild' } }
        },
        settings: {
          description: 'Settings (iOS Settings): You, Setup, Lite mode, Data',
          meta: { owner: 'studio', live: null, sitemap: ['7. Me › Settings'] },
          initial: 'index',
          states: {
            index: {
              description: 'The groups',
              meta: { owner: 'studio', live: null, sitemap: [] },
              // Settings › Setup closes Settings and opens the Setup sheet on its Parts (one sheet at a time)
              on: { up: '#me.index', setup: '#projects.setup.parts' }
            }
          }
        }
      }
    },

    draft: {
      id: 'draft',
      description: 'A new project talked through on the Design deck; nothing built yet',
      meta: { owner: 'studio', live: 'draft', sitemap: ["6. Projects › Don't build yet, talk first, a question → Design deck chat: Hermia talks, nothing built → Build → The brief → Build or Keep talking"] },
      on: { up: { target: '#projects' } }
    },

    planBoard: {
      id: 'planBoard',
      description: "A game's plan board (spec 21): nothing that costs credits runs before Lock",
      meta: { owner: 'studio', live: 'plan', sitemap: ['5. + Create › Plan board: cards, inspector, Lock · N credits', '5b. The Plan board (spec 21) › Projects › plan ▾ (Save as template)', '5b. The Plan board (spec 21) › Nine cards: name and one value'] },
      initial: 'board',
      states: {
        board: {
          description: 'Nine cards, the inspector, Starter, Systems, Sketches, Mocks, World',
          meta: { owner: 'studio', live: 'plan', sitemap: [] },
          on: { up: { target: '#projects' }, lock: 'gate' }
        },
        gate: {
          description: 'The gate: price by part; Build or Build one',
          meta: { owner: 'studio', live: 'plan', sitemap: ['5b. The Plan board (spec 21) › Lock · N credits', '5b. The Plan board (spec 21) › Gate: price by part, runs, pictures, Test one first', '5b. The Plan board (spec 21) › Build / Build one'] },
          on: { up: 'board', build: { guard: 'hasRun', target: '#gameRoom', actions: 'openGame' } }
        }
      }
    },

    scaffold: {
      id: 'scaffold',
      description: "A Studio project's scaffold before its first build (spec 37)",
      meta: { owner: 'studio', live: 'studio', sitemap: ["5c. The Studio's scaffold (spec 37) › Projects › name · Build", "5c. The Studio's scaffold (spec 37) › Left chat: Start with X, and why"] },
      initial: 'brand',
      on: { built: { guard: 'hasRun', target: '#deck', actions: 'startRun' } },
      states: {
        hist: { type: 'history', history: 'shallow' },
        brand: {
          description: 'Brand: the brand card, then the brand sheet',
          meta: { owner: 'studio', live: 'studio', sitemap: [] },
          on: { up: { target: '#projects' }, next: 'references' }
        },
        references: {
          description: 'References: add, drop, Use as given, Remove',
          meta: { owner: 'studio', live: 'studio', sitemap: [] },
          on: { up: 'brand', next: 'assets' }
        },
        assets: {
          description: 'Assets: add, drop, Role, Use as reference, Remove',
          meta: { owner: 'studio', live: 'studio', sitemap: [] },
          on: { up: 'references', next: 'pages' }
        },
        pages: {
          description: "Pages (a website's storyboard strip); live calls this step plan",
          meta: { owner: 'studio', live: 'studio', sitemap: [] },
          on: { up: 'assets', next: 'lock' }
        },
        lock: {
          description: 'Lock the idea; live calls this step proposal. Build follows',
          meta: { owner: 'studio', live: 'studio', sitemap: [] },
          on: { up: 'pages' }
        }
      }
    },

    brandSheet: {
      id: 'brandSheet',
      description: 'The brand sheet; Esc goes back where it was opened from',
      meta: { owner: 'studio', live: 'brand', sitemap: [] },
      exit: 'forgetFrom',
      on: {
        up: [
          { guard: 'fromScaffold', target: '#scaffold.hist' },
          { guard: 'fromPlan', target: '#planBoard' },
          { guard: 'fromDraft', target: '#draft' },
          { guard: 'fromBuild', target: '#build.hist' },
          { target: '#projects' }
        ]
      }
    },

    build: {
      id: 'build',
      description: 'A project with a version open (context.version)',
      meta: { owner: 'studio', live: 'build', sitemap: ['8. A project: the Overview › A project'] },
      initial: 'playable',
      on: {
        'room.overview': { target: '#overview' },
        'room.deck': { target: '#deck' },
        'room.app': { target: '#engineRoom' },
        'room.video': { target: '#filmStudio' },
        'room.game': { guard: 'hasRun', target: '#gameRoom', actions: 'openGame' },
        'room.launch': { target: '#launchPad' },
        versions: { target: '#versions' },
        share: { target: '#share' },
        progress: { target: '#progress' },
        crew: { target: '#crewRadio' }
      },
      states: {
        hist: { type: 'history', history: 'deep' },
        playable: {
          description: 'The rooms the player can open over: room × player, as in web/nav.js',
          meta: { owner: 'studio', live: 'build.playable', sitemap: [] },
          type: 'parallel',
          states: {
            room: {
              description: 'Which room',
              meta: { owner: 'studio', live: 'build.playable.room', sitemap: [] },
              initial: 'overview',
              states: {
                overview: {
                  id: 'overview',
                  description: "The Overview: the project's pages and files",
                  meta: {
                    owner: 'studio',
                    live: 'build.playable.room.overview',
                    sitemap: [
                      '8. A project: the Overview › Top bar: Projects › name ▾, the mode menu (Overview, Canvas, Video, App, Game), the crew, Play, Publish',
                      '8. A project: the Overview › ☰ Review, Video, Export, Replay',
                      '8. A project: the Overview › Left panel',
                      '8. A project: the Overview › Files: Site, Story, App, Game, Film, Art, Uploads, Code',
                      '8. A project: the Overview › Stage: artboards in sections',
                      '8. A project: the Overview › Inspector (while something is selected)',
                      '8. A project: the Overview › Dock: Move, Frame, Text, Image, Comment, Tell the crew…'
                    ]
                  },
                  on: { up: { guard: 'playerClosed', target: '#projects' } }
                },
                deck: {
                  id: 'deck',
                  description: 'The Design deck (Canvas): Figma’s layout; the crew watched at work',
                  meta: {
                    owner: 'studio',
                    live: 'build.playable.room.deck',
                    sitemap: [
                      '1. The whole product › Studio: the new build in the Design deck',
                      '2. Navigation › Studio: the new build in the Design deck',
                      'Design deck › Design deck',
                      'Design deck › Left panel',
                      'Design deck › Logo menu',
                      'Design deck › Pages',
                      'Design deck › Layers',
                      'Design deck › A section',
                      'Design deck › An element',
                      'Design deck › Canvas',
                      'Design deck › Crew cursors',
                      'Design deck › Follow one agent',
                      'Design deck › Comment pins',
                      "Design deck › The Critic's issues (3 at most)",
                      'Design deck › Toolbar',
                      'Design deck › Comment',
                      'Design deck › Right panel',
                      'Design deck › Nothing selected: page and variables',
                      'Design deck › Design tab',
                      'Design deck › Appearance: fill, stroke, effects',
                      'Design deck › Fill',
                      'Design deck › Token (a variable)',
                      'Design deck › Prototype tab'
                    ]
                  },
                  initial: 'live',
                  on: { up: { guard: 'playerClosed', target: '#overview' } },
                  states: {
                    live: {
                      description: 'The build as it is, Follow on while the crew works',
                      meta: { owner: 'studio', live: 'build.playable.room.deck.live', sitemap: [] },
                      on: { replay: 'replay' }
                    },
                    replay: {
                      description: 'Replay: the saved build plays again; Stop replay puts it back',
                      meta: { owner: 'studio', live: 'build.playable.room.deck.replay', sitemap: [] },
                      on: { 'replay.stop': 'live' }
                    }
                  }
                },
                app: {
                  id: 'engineRoom',
                  description: 'The Engine room: preview, files, checks, deploy and data',
                  meta: {
                    owner: 'studio',
                    live: 'build.playable.room.app',
                    sitemap: [
                      'Engine room › Engine room',
                      'Engine room › Files',
                      'Engine room › A folder',
                      'Engine room › A file',
                      'Engine room › A line',
                      'Engine room › Checks',
                      'Engine room › Failing',
                      'Engine room › A check',
                      'Engine room › Error marker',
                      'Engine room › ⋯ Deploy, Data',
                      'Engine room › Data (Supabase)',
                      'Engine room › A table'
                    ]
                  },
                  on: { up: { guard: 'playerClosed', target: '#overview' } }
                }
              }
            },
            player: {
              description: 'The player over the room (spec 34)',
              meta: { owner: 'studio', live: 'build.playable.player', sitemap: [] },
              initial: 'closed',
              states: {
                closed: {
                  description: 'No player',
                  meta: { owner: 'studio', live: 'build.playable.player.closed', sitemap: [] },
                  on: {
                    play: { target: 'prototype', actions: 'pickPage' },
                    watch: { target: 'visitor', actions: 'pickPage' }
                  }
                },
                prototype: {
                  description: 'Play: the prototype, links work',
                  meta: { owner: 'studio', live: 'build.playable.player.prototype', sitemap: [] },
                  entry: 'playerOpen',
                  exit: 'playerShut',
                  on: { close: 'closed', up: 'closed', watch: 'visitor', page: { actions: 'pickPage' } }
                },
                visitor: {
                  description: 'Watch: a visitor walks the site',
                  meta: { owner: 'studio', live: 'build.playable.player.visitor', sitemap: [] },
                  entry: 'playerOpen',
                  exit: 'playerShut',
                  on: { close: 'closed', up: 'closed', stop: 'prototype', page: { actions: 'pickPage' } }
                }
              }
            }
          }
        },
        video: {
          id: 'filmStudio',
          description: 'The Film studio: watch, new cut, shots',
          meta: { owner: 'studio', live: 'build.video', sitemap: ['Film studio and Launch pad › Film studio', 'Film studio and Launch pad › New cut', 'Film studio and Launch pad › Shots', 'Film studio and Launch pad › A shot', 'Film studio and Launch pad › Prompt and source'] },
          on: { up: { target: '#overview' } }
        },
        game: {
          id: 'gameRoom',
          description: 'The Game room (context.run is the game run)',
          meta: { owner: 'studio', live: 'build.game', sitemap: ['Game room › Game room'] },
          initial: 'play',
          states: {
            play: {
              description: 'Play, the pause menu, Report a bug',
              meta: { owner: 'studio', live: 'build.game', sitemap: ['Game room › Play', 'Game room › Pause menu', 'Game room › Report a bug', 'Game room › Pin the spot', 'Game room › Fixer takes it'] },
              on: { up: { target: '#overview' }, tweak: 'tweak', details: 'details', building: 'building' }
            },
            tweak: {
              description: 'Tweak: feel, look, rules; a slider shows its value in the code',
              meta: { owner: 'studio', live: null, sitemap: ['Game room › Tweak', 'Game room › Feel', 'Game room › Gravity', 'Game room › Slider', 'Game room › Value in the code', 'Game room › Look', 'Game room › Rules'] },
              on: { up: 'play' }
            },
            details: {
              description: 'Details: code, assets, logs',
              meta: { owner: 'studio', live: null, sitemap: ['Game room › Details'] },
              on: { up: 'play' }
            },
            building: {
              description: "The build's wall: painting, writing; out of quota; stopped",
              meta: { owner: 'studio', live: null, sitemap: ['Game room › Build', 'Game room › Painting the art', 'Game room › No art: model out of quota', 'Game room › Another image model', 'Game room › Stopped: N/M pictures · stage x of 5', 'Game room › Go on'] },
              on: { up: 'play' }
            }
          }
        },
        launch: {
          id: 'launchPad',
          description: 'The Launch pad: site, promo video, posts by channel',
          meta: { owner: 'studio', live: null, sitemap: ['Film studio and Launch pad › Launch pad', 'Film studio and Launch pad › Posts', 'Film studio and Launch pad › A channel', 'Film studio and Launch pad › A post', 'Film studio and Launch pad › Schedule', 'Film studio and Launch pad › Promo video'] },
          on: { up: { target: '#overview' }, promo: { target: '#filmStudio' } }
        },
        versions: {
          id: 'versions',
          description: 'Versions: compare, restore, who changed what and why',
          meta: { owner: 'studio', live: null, sitemap: ['9. Progress, versions, share › Versions', '9. Progress, versions, share › A version', '9. Progress, versions, share › Compare', '9. Progress, versions, share › Changes per page'] },
          on: { up: { target: '#overview' } }
        },
        share: {
          id: 'share',
          description: 'Share: link, publish, promote, Post to Feed',
          meta: {
            owner: 'studio',
            live: null,
            sitemap: [
              '9. Progress, versions, share › Share',
              '9. Progress, versions, share › Publish',
              '9. Progress, versions, share › Website',
              '9. Progress, versions, share › Address',
              '9. Progress, versions, share › Custom domain',
              '9. Progress, versions, share › Promote',
              '9. Progress, versions, share › Post to Feed',
              '9. Progress, versions, share › Pick the cover clip and assets'
            ]
          },
          on: { up: { target: '#overview' }, posted: { target: '#feedHome' } }
        },
        progress: {
          id: 'progress',
          description: 'The progress ring, open: phases, agents, decisions and why',
          meta: {
            owner: 'studio',
            live: null,
            sitemap: [
              '9. Progress, versions, share › Progress ring',
              '9. Progress, versions, share › Make',
              '9. Progress, versions, share › Pages',
              '9. Progress, versions, share › Designer',
              '9. Progress, versions, share › Decided',
              '9. Progress, versions, share › Why',
              '9. Progress, versions, share › Prompt and model'
            ]
          },
          on: { up: { target: '#overview' } }
        },
        crew: {
          id: 'crewRadio',
          description: "Hermia's crew radio: her reasoning, the agents, the chatter",
          meta: { owner: 'studio', live: null, sitemap: ['11. Hermia, the commander › Click her', '11. Hermia, the commander › Crew radio', '11. Hermia, the commander › Her reasoning'] },
          on: { up: { target: '#overview' } }
        }
      }
    },

    hosted: {
      id: 'hosted',
      description: 'The hosted studio on the web: a guest tries a small build, a few a day (spec 13)',
      meta: { owner: 'hosted', live: null, sitemap: [] },
      initial: 'tryIt',
      states: {
        tryIt: {
          description: '/studio: Try it here',
          meta: { owner: 'hosted', live: null, sitemap: ['1. The whole product › /studio › Try it here'] },
          on: { up: { target: '#feedHome' }, try: 'guestBuild' }
        },
        guestBuild: {
          description: '/studio/app: the guest build; Post to Feed',
          meta: { owner: 'hosted', live: 'build.playable.room.overview', sitemap: ['1. The whole product › Hosted studio /studio/app: guest build'] },
          on: { up: 'tryIt', posted: { target: '#feedHome' }, limit: 'limitReached' }
        },
        limitReached: {
          description: "The day's limit: pointed to Hermes and the plugin; the web app ends here",
          meta: { owner: 'hosted', live: null, sitemap: [], terminal: true },
          on: { up: 'tryIt' }
        }
      }
    }
  }
})

export default studioMachine
