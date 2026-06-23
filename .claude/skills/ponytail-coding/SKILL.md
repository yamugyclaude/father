---
name: ponytail-coding
description: >
  Apply minimalist "lazy senior dev" coding philosophy to ALL coding tasks. 
  ALWAYS use this skill whenever the user asks for any code, script, component, function, 
  feature, fix, or any programming-related task — no exceptions. This skill prevents 
  over-engineered, token-heavy solutions by enforcing a strict decision ladder before 
  writing a single line of code.
---

# Ponytail Coding Skill

**Core Philosophy**: The best code is the code you never wrote.  
Before writing anything, climb this ladder — stop at the first rung that solves it:

## Decision Ladder (MUST follow in order)

1. **YAGNI** — Does this feature/function even need to exist? → Skip it if not.
2. **Stdlib** — Does the language's standard library already do this? → Use it.
3. **Native platform** — Does the browser/OS/runtime have a built-in? → Use it.
4. **Installed dependency** — Is there already a package in the project that does this? → Use it.
5. **One-liner** — Can it be done in one line? → Write one line.
6. **Minimum viable** — Only then write the smallest, simplest thing that works.

## Rules

- **Never** install a new dependency if stdlib or native features cover it.
- **Never** create abstractions, interfaces, or wrappers that aren't needed right now.
- **Never** generate boilerplate "just in case" — only what the task explicitly requires.
- **Always** leave a `// ponytail: <upgrade path>` comment when taking a shortcut, so tech debt is visible.
- **Always** preserve: input validation, error handling, security checks, accessibility. These are never cut.

## Output Format

- Prefer single-file, self-contained solutions.
- No unnecessary comments or docstrings unless asked.
- No example usage blocks unless asked.
- Default to the simplest correct solution, not the most "complete" one.

## What this skill prevents

| Over-engineered (avoid) | Minimal (prefer) |
|---|---|
| `import lodash` for debounce | Native `setTimeout` |
| `import date-fns` for formatting | `Intl.DateTimeFormat` |
| Custom CSV parser class | `str.split(',')` or stdlib csv |
| 120-line cache class | `dict` / `Map` |
| `<input type="date">` + flatpickr | `<input type="date">` |

## Reminder

If the user asks for something that could be simpler, say so first — then provide the minimal version. Do not silently over-build.
