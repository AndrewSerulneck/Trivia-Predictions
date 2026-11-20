# Hightop question writer (private repo)

Writes the day's Speed and Live Trivia questions with ChatGPT (your Pro plan, no money), grades them with ChatGPT in a
separate session (the bar test), and sends both to the site. The site checks every one (rules, variety, the grade,
repeats) before it shows up in Quick Review. `write.mjs` runs it; `day.mjs` holds the day's loop and `grade.mjs` its small helpers (the `.d.mts` files are
types for the main repo's tests).

This folder is the source for the **private** repo `hightop-question-writer`. It lives in the main repo only so it
is reviewed with the rest; the main repo never holds the login. Plan: `docs/speed-trivia-backlog-and-quality-plan.md`
(Phase 4b) in the main repo.

## What the private repo holds

| Name | Kind | What |
| --- | --- | --- |
| `CODEX_AUTH_JSON` | secret | A separate ChatGPT login for this repo only (never your laptop's). Set by `renew-login.sh`. |
| `QUESTION_WRITER_TOKEN` | secret | Lets this repo read the daily brief and send questions. Nothing else. |
| `SECRETS_WRITE_TOKEN` | secret | A fine-grained GitHub token for this repo only, permission "Secrets: Read and write". Saves the refreshed login. |
| `WRITER_BASE_URL` | variable | `https://hightopchallenge.com` |
| `CODEX_MODEL` | variable (optional) | Default `gpt-6-astra`. Writes and grades. |
| `CODEX_GRADE_EFFORT` | variable (optional) | Grading effort, default `medium` (calibrated 2026-11-18). |
| `WRITER_GAMES` | variable | `speed,live`. |

## If GitHub emails you that "Write questions" failed

- **"ChatGPT login needs renewing"**: on your Mac, run `bash renew-login.sh` and follow the link it shows. Done.
  Whatever that game had already written was still sent.
- **"The site rejected the writer token"**: ask Claude to rotate `QUESTION_WRITER_TOKEN`.
- **Anything else**: run it again from the Actions tab ("Run workflow"). If it fails twice, that day gets no new
  questions, and Quick Review says "Writer stopped" after two days.
- **"grading: … (the site grades these instead)"** in the log: the questions were still sent; the site graded them.
  A failed grading call never stops the run.
- **"repeated slot(s) dropped"** in the log: ChatGPT wrote two questions for one slot; the first was kept.
- **"conversions: …"** in the log: the Speed questions you sent with Make Live stay queued and go again the next night.

## Make Live (Phase 4e)

On a night with Speed questions queued by **Make Live** (Admin question list, or key L in Quick Review), the Live brief
adds a third prompt. ChatGPT rewrites each as a Live question with the same answer, or declines with a reason. The
rewrites are graded like the rest and posted to `/api/question-writer/conversions` after the day's Live batch. The
site sends at most 20 a night (`QUESTION_WRITER_CONVERSIONS_PER_NIGHT` on the site; 0 turns it off).

## Run it by hand

Actions tab → Write questions → Run workflow.
