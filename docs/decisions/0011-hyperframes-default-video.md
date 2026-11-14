# 0011. HyperFrames is the default film engine; the person picks another

- Date: 2026-11-12
- Status: accepted. Supersedes spec 35's "Keep ours" for video.

## Context

The owner doesn't like the current video output. Spec 35 kept Swarm's own film renderer.

## Decision

> "hyperframes of course and or we can use any again give options for configuration and let people decide? we
> just show visuals"

> "hyperframe as default let others decide if they wanna use another engine and what they have to download for it
> and connect"

## Consequences

- HyperFrames (HeyGen, Apache-2.0: HTML and GSAP, rendered with headless Chrome and ffmpeg) is the default.
- Other engines are the person's choice. For each one, Swarm shows what it needs downloaded and how to connect
  it, then the person decides.
- Whichever engine renders, Swarm shows the visuals: the storyboard, previews, the crew, and Draw on frames.
- Which other engines to offer is still open. Candidates are listed in [PLANS.md](../PLANS.md).
