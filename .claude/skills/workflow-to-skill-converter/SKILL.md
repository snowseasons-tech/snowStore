---
name: workflow-to-skill-converter
description: Turn the task just completed in this session into a reusable skill or prompt. Use when finishing a task and asked to save the steps, turn this into a skill, make this a reusable routine or prompt, or "do this again next time". Reads the session, extracts the general step-by-step logic, strips context-specific details, and writes a SKILL.md.
---

You convert a finished piece of work into a reusable skill. The result must work for a different input next time, not replay this session.

## Inputs

- **Source:** the current conversation by default. If the user points at another transcript file, read that instead.
- **Name and place:** ask only if not given. Default name: a short kebab-case verb phrase. Default place: `.claude/skills/<name>/SKILL.md` in the current project; use `~/.claude/skills/<name>/` only if the user wants it available everywhere.
- **Existing skill with the same purpose:** check `.claude/skills/*/SKILL.md` descriptions first. If one exists, update it instead of creating a duplicate.

## Steps

1. **Find the task.** State in one sentence what the session accomplished and what the end result looked like. If the session held several unrelated tasks, ask which one to convert.
2. **Extract the path that worked.** Walk the transcript and list each action that contributed to the result, in order. Drop dead ends, retries, and exploration that led nowhere. Keep a dead end only if it is a trap the next run would also hit, and record it as a gotcha.
3. **Separate fixed from variable.** For every step, decide what stays the same each run and what changes (file names, IDs, dates, amounts, names, URLs, one-off decisions). Variables become named inputs.
4. **Strip context.** Remove or generalize: personal names, emails, account IDs, secrets and tokens (never copy these), absolute paths specific to this machine, dates, quoted data, and opinions about this particular case. Replace with `<placeholders>` or a stated input.
5. **Keep what is non-obvious.** Preserve the commands, flags, ordering constraints, and decisions the model could not guess: which tool to use, why an order matters, what check proves a step worked. Cut anything a competent agent would do anyway.
6. **Mark hard stops.** If a step sends something, publishes, spends money, deletes, or needs the user's approval, the skill must say to confirm first.
7. **Write the SKILL.md** using the format below.
8. **Check it.** Reread it as someone who never saw this session: can they run it with a new input? Confirm no leftover specifics (search for the names, paths and IDs from the session). If a command in it was not actually run in the session, say so or leave it out.
9. **Report** the path, the inputs it takes, and anything you were unsure about. Do not commit it unless asked.

## Output format

```
---
name: <kebab-case-name, matches the folder>
description: <one or two sentences: what it does, plus the verbs a user would say to trigger it>
---

<One paragraph: what the skill does and what it produces.>

## Inputs
- <input>: <what it is, default if any>

## Steps
1. <imperative step, with the exact command or tool when it matters>
2. ...

## Gotchas
- <non-obvious trap and its fix, only ones seen in the session>

## Done when
- <observable check that the result is right>
```

Keep the body short: aim for under 80 lines. Steps are numbered and imperative. Put long reference material in a separate file next to the SKILL.md and link it.

## Rules

- Never include credentials, tokens, private data, or the user's real customer or account details.
- Do not invent steps, flags, or results that did not happen in the session.
- One skill per task. If the session suggests two separate routines, make two.
- If the session has no repeatable pattern (a pure one-off), say so instead of producing a hollow skill.
- If the user wants a plain reusable prompt instead of a skill, output the same Inputs and Steps as a prompt with `{{placeholders}}` and skip the frontmatter.
