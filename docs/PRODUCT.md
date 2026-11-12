# What Swarm is (owner, 2026-11-12)

Every session reads this first. Where a spec, the pitch or older docs disagree with this page, this page wins.
The detail behind each point is in [docs/decisions/](decisions/README.md).

## Swarm Studio runs on the person's own machine

Swarm Studio is a local plugin inside the person's own Hermes. It uses their models, their keys, their engines
and their accounts. We host nothing for it: there is no hosted studio, no Swarm server that builds for anyone,
and no credits to buy builds from us.

In the owner's words: "the goal is to have something that can utilize various engine and put it all together in
one place and give our view layer visual builder and ux layer". All of it runs through Hermes, so the person also
gets the benefit of their other Hermes plugins.

## Swarm Feed is the only hosted part

The Feed is the one thing we run. It is where people:

- show what they built;
- bring in collaborators;
- annotate builds and keep boards;
- join events and jams.

"swarm is only hosting server for the social media to showcase what they built, to bring in collaborators,
annotation, events etc, everything else is done by other people and their own studio."

## What is Swarm's own (the moat)

- The workspace and its UX: the visual layer that holds every engine in one place.
- The crew: its prompts, its parallel orchestration and its review loops.
- The game plan and the play-test loop.
- Story.
- The Feed and collaboration.

## What is borrowed, and optional

Engines and connections that the person reaches through Hermes. Examples: Godot, Dyad, Meshy, Open Design's data,
music tools, publishing targets and posting tools. Swarm configures them and shows them in the workspace. It does
not rebuild them.

## The test for any new feature

Answer four questions before building it:

1. Where does it run?
2. Who pays?
3. Which mature engine does it?
4. How does the workspace show it and steer it?

If the answer to "where does it run" is "on our server", the feature must be part of the Feed. Otherwise it is
wrong.

## Standing rules

- **Mature dependencies.** "use mature dependency wherever possible … dont reinvent the wheel." See the top of
  [AGENTS.md](../AGENTS.md).
- **A person's press.** Nothing builds, publishes or posts until a person presses for it.
- **We never post.** Swarm never posts for anyone and never holds their social accounts. "we are not gonna post,
  the users themself have to connect and do it." Swarm makes the post ready and opens the network, or hands it
  to a posting plugin the person already has in Hermes.
- **Talk and lock before building.** The plan is agreed in the chat and locked before the crew builds.
- **Names only.** Never tooltips.
