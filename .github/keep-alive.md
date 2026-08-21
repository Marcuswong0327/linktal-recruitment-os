# Keep-alive

GitHub automatically disables a repository's scheduled workflows (including
`db-backup.yml`, the nightly production DB backup) after 60 days with zero
repository push activity — running a schedule does **not** reset that clock
by itself, only an actual `git push` does.

`.github/workflows/keep-alive.yml` pushes a real, trivial commit to this file
every month — comfortably under that 60-day window — purely so every
scheduled workflow in this repo stays enabled, even during a long quiet
period with no other commits. See `docs/migrations.md` §8.

Last touched: (updated automatically — do not edit by hand)
