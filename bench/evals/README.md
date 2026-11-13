# Prompt evals

Decision 0019 (point 5) and issue #464: a change to a crew prompt runs the crew's test sets before and after,
and fails past the thresholds. It is how decision 0007's "a prompt change comes with a test set" is enforced.

- **The prompts** are caught as the crew sends them: the builder's, the page planner's, the sitemap's, the
  reviewer's and the fix prompts (`run.mjs fingerprint`). A change to any of them gives a new fingerprint; a
  change elsewhere in those files does not.
- **The test sets** (`sets/`): one page each, built by a crew of eight through the real `workerMessages` and the
  tree's own fix pass, the way `engine/run.mjs` builds it. `kiln` is a light product site with numbers and
  prices; `harbour` is a dark public-service site with a timetable.
- **What is measured**, per set, as the mean of the runs:

  | | how |
  |---|---|
  | score | the reviewer (`engine/review.mjs` `reviewPage`, a vision model) on a 1280-wide photo of the page, 0–10. A tree from before the scored review gives 10 minus 2 per issue, and the score is then not compared |
  | findings | slop-linter findings (`engine/lint`) per section, P0 and P1, counted with the newer tree's linter on both sides |
  | time | the page's wall time, fix passes included |
  | tokens | prompt and completion tokens, as the endpoint counts them |

- **The thresholds** (`thresholds.json`): after against before, on any set, the score may drop by at most 0.5,
  findings per section rise by at most 0.25 and P0 findings by at most 1, wall time by at most 25% and prompt
  tokens by at most 40%.

## Run it

```bash
node bench/evals/run.mjs gate --base origin/main
```

That measures the base's prompts and this tree's, two runs a set (`--runs`), and writes
`reports/<fingerprint>.json` with both sides, the table and anything past a threshold. Commit that file with the
prompt change. The model key is `SWARM_API_KEY`, else Hermes's InferHub key on this machine. The models are
`cb/deepseek-v4.1-flash` for the crew and `ali/qwen3.8-omni-flash` for the reviewer
(`SWARM_EVAL_MODEL`, `SWARM_EVAL_REVIEWER`).

## In CI

The `prompt-evals` job runs when `engine/prompts.mjs`, `engine/review.mjs`, `engine/pagetype.mjs`, `engine/lint/`
or this folder changes. When the fingerprint differs from the base's:
- with the `SWARM_EVAL_API_KEY` secret set, it runs the gate itself;
- without it, it needs the committed report for this fingerprint, made against the base's fingerprint, and checks
  it against the thresholds.

The reports are uploaded as the `prompt-evals` artifact, and the table goes in the job's summary.
