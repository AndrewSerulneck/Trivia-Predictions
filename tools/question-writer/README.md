# Hightop question writer (private repo)

Writes about 16 Speed Trivia questions a day with ChatGPT (your Pro plan, no money) and sends them to the site.
The site checks every one (rules, variety, bar test, repeats) before it shows up in Quick Review.

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
| `CODEX_MODEL` | variable (optional) | Default `gpt-6-astra`. |

## If GitHub emails you that "Write questions" failed

- **"ChatGPT login needs renewing"**: on your Mac, run `bash renew-login.sh` and follow the link it shows. Done.
- **"The site rejected the writer token"**: ask Claude to rotate `QUESTION_WRITER_TOKEN`.
- **Anything else**: run it again from the Actions tab ("Run workflow"). If it fails twice, the site's nightly uses
  Gemini for that day, and Quick Review says "Writer stopped" after two days.

## Run it by hand

Actions tab → Write questions → Run workflow.
