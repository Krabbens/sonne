# Validation record

## Automated setup guide and OAuth2 prompts, 14 October 2026

The six-page English automated-install guide includes the Prompt Studio
website, Discord sign-in, collection of the OAuth2 Client Secret, registration
of the exact callback and use of personal discipline profiles and Apply to
Sonne. The installer lists the bot token and OAuth2 secret in the same initial
credential phase and prints the website address and callback after setup.

- **Five installer credential tests passed**, including hidden entry of both
  secrets, IDs and the web address in one terminal sequence, mandatory OAuth
  for a full unattended setup, validation and reuse of saved credentials.
- Shell syntax and repository whitespace checks passed. The diagnostic
  Compose configuration resolves all three services: Ollama, OpenClaw and
  Prompt Studio.
- The PDF compiled with pdflatex without layout warnings. All six rendered
  pages were reviewed; the existing figures and the instruction to save IDs
  remain present. Text extraction confirmed the callback, OAuth2 prompt,
  website URL, sign-in and publication instructions.

These checks use synthetic credentials and do not reset or change the live
Discord application's secrets. The guide's portal steps remain actions for
the installation administrator.

## English Team River workspace, 14 October 2026

The active Team River shared brief, personal architect profile, urgent requests,
discipline priorities, owner feedback, cost-category labels, source descriptions
and all three file originals now use English. The studio hook requires English
in both focused and full context, and the runtime persona’s previous
user-language instruction was changed to English. Existing proper names,
historical records and earlier prompt snapshots are retained.

- **69 Node.js tests passed.** Checks confirm English instructions in focused
  and full context. The 12 request IDs, priority order, types, providers,
  recipients, dates, statuses and numeric project fields match the backup.
- Both briefs were published, their memory and file originals updated, and the
  downloadable prompt, workspace export and Discord test questions refreshed.
  The prior workspace, original files, hook and persona are backed up privately.
  File-tool working rules were preserved.
- A local Qwen check asked the planning-status question in Polish and received
  an English response with English task descriptions. The deployed OpenClaw
  loader confirmed the English policy in both context modes. All three Sonne
  services are healthy.

## Planning status interpretation, 14 October 2026

Status reports now receive explicit provider → recipient direction, request
IDs, exact deadlines, completion and dependent-task blocking facts computed
from the applied plan. Ready to share remains undelivered; unfinished requests
block their listed dependent tasks. Priority order does not create extra
dependencies. A compact facts table includes priority/date conflicts and
prevents treating owner names as provider assignments. Clear planning-status
questions receive that focused context; mixed questions retain the full brief
and memory.

- **69 Node.js tests passed on the host.** Added coverage checks all six
  information/action status combinations, provider/recipient direction,
  task dates versus project milestones, focused questions, mixed questions
  and applied-plan facts taking precedence over earlier personal notes without
  publishing changed draft values.
- Local Qwen3.5 2B inference with the full context remained inconsistent even
  after explicit status instructions. The focused context returned demo-02,
  demo-03 and demo-04 in order, with the correct providers, recipients, dates,
  statuses and blocked dependent tasks. This was a local model check, not a
  Discord message, and does not establish general model reliability.
- The existing Team River plan was republished using the new compiled format.
  Its 12 requests, statuses, dates, shared fields and history were preserved.
  Previous code and published files were backed up in the private runtime.

## Discord user anchors, 14 October 2026

Personal briefs now include the authenticated account’s Discord ID, display
name and native `<@USER_ID>` mention in Review prompt, Copy, publication and
version snapshots. The publication server supplies identity from the verified
session. The OpenClaw hook independently adds the trusted current sender’s
anchor, including for older applied briefs and before any brief is published.
Project memory also includes verified author mentions beside history entries.
Accounts remain distinct when display names or selected disciplines match;
discipline owners remain separate people.

- **65 Node.js tests and 5 Python installer tests passed on the host.** Four
  new tests cover reviewed/copied output, forged identity fields, published
  briefs and versions, two accounts in the same discipline, sender changes,
  operation before Apply and history authors with the same display name.
- The Node.js 22 container passed all **64 runtime tests**, skipping only the
  root-incompatible installer test that passed on the host. Frontend, server
  and plugin syntax checks passed.
- The updated web service and hook were deployed to the existing Ubuntu
  runtime after backing up their previous files. Saved drafts, active briefs,
  SOUL.md and AGENTS.md retained their hashes; regenerated project memory
  retained the saved revision and complete history. No test brief was applied
  to the live workspace and no Discord message or inference was sent.
- OpenClaw’s loader registered the updated `before_prompt_build` hook. Its
  handler returned the trusted sender’s anchor and current project memory,
  while rejecting an unknown sender. OpenClaw, Prompt Studio and Ollama are
  healthy.

## Owners in memory and history, 14 October 2026

**Sonne & team → Owners** keeps its five editable rows. Owner names and
requirements now save automatically to shared project memory and are excluded
from the reviewed and applied prompt. **Project → History** and CSV record name
and feedback edits with the verified author, timestamp and previous and current
values. The memory keeps owners distinct from team members and marks current
owner records as taking precedence over historical entries.

- **61 Node.js tests passed.** Owner coverage verifies automatic bot visibility
  before Apply, authored history and CSV, revision conflicts, restart recovery,
  older workspaces, clearing entries and complete storage of long feedback with
  bounded context. The Node.js 22 container run passed all 60 runtime tests; its
  root-only environment skipped the installer test that passed on the host.
- The existing published prompt was backed up and its exact legacy Owners
  section removed. All applied text outside that section, the saved draft,
  recorded history and both revision numbers were preserved. No unapplied brief
  was published. The deployed memory contains the existing owner records.
- The web service and OpenClaw are healthy. The running OpenClaw loader
  registered the hook and confirmed owner context came from saved memory, with
  no Owners section in the applied shared brief. The core persona and rules
  retained their previous hashes. No Discord message or inference was sent.
- Browser preview checks verify Owners edits in Project history and their
  absence from Review prompt. The final preview is recorded in
  `output/screenshots/owners-history.jpg`.

## Project brief and live project memory, 14 October 2026

**Project → Brief** contributes to the applied prompt. Performance, Monitoring
costs, shared project files and history save automatically to persistent project
memory, available on the next permitted Discord turn without Apply to Sonne.
Team instructions, Owners and personal preferences retain their prompt scopes.

- **60 Node.js tests passed.** New coverage verifies prompt/memory separation,
  memory before any prompt publication, automatic original-file copies, fresh
  reads on subsequent turns, restart restoration, personal isolation, bounded
  context with complete stored records, corrupt-memory rejection and rollback
  when memory cannot be written. The installer prepares both directories for
  the read-only memory mount before Docker starts.
- The web service and OpenClaw are healthy. In the running OpenClaw container,
  the pinned loader registered the `before_prompt_build` hook and its handler
  received the saved memory. The complete JSON was readable inside the permitted
  workspace, and a write probe to its mount failed with EROFS.
- The memory revision matched the existing saved shared revision. The shared
  draft and the core SOUL.md and AGENTS.md files matched their pre-update copies.
  No test prompt was published to the live workspace and no Discord message or
  inference was sent.
- Browser preview checks confirmed that Brief appears in Review prompt while
  performance and cost test values do not. Memory sections no longer present a
  Review prompt action in their footer. The final view is recorded in
  `output/screenshots/project-brief-and-memory.jpg`.

## Monitoring costs, 14 October 2026

**Project → Monitoring costs** replaces the Costs tab label. The **+** beside
Other costs adds a named category with an optional amount. Categories support
renaming, direct amount edits and removal, use the selected project currency
and contribute once to the total alongside existing standard and uncategorised
costs. They are shared project data and appear in the reviewed and applied brief.

- **53 Node.js tests passed.** Coverage includes older workspaces, category
  validation and limits, totals, two-user access, stale revisions, rename and
  removal history, currency changes, CSV, prompt publication and restart
  persistence. Previously opened clients preserve categories when saving fields
  without the new category property.
- Browser preview checks verified the plus button, category form, inline amount
  edits, renaming, the resulting total, category history chart and prompt output.
  The final preview is recorded in `output/screenshots/monitoring-costs.jpg`.
- The updated web service runs in the existing local stack. Sample category
  values were confined to the temporary preview and isolated test workspaces.

## Owners, 14 October 2026

**Sonne & team → Owners** now provides five vertically stacked discipline
rows. Each row has an editable **Name Surname** placeholder, an explicit
discipline-owner label and a requirements-and-feedback textarea. Entries save
with the shared draft and are included in the reviewed and applied team brief.
Owners are separate people from team members; their rows have no profile
portraits or profile links. The prompt explicitly distinguishes a construction
worker from the Construction owner and keeps owner requirements separate from
the authenticated team member’s preferences. Existing owner entries are retained.

- **48 Node.js tests passed.** Owner coverage includes older workspace
  migration, validation limits, visibility to a second account, stale revision
  rejection, persistence after restart and shared prompt publication. Two team
  members choosing the same discipline remain distinct from its owner; changing
  a member’s discipline preserves every owner entry and published owner brief.
- The updated web container is healthy at `http://localhost:9080`. Browser
  checks in preview confirmed all five editable entries and their multiline
  feedback in Review prompt. The final blank layout is recorded in
  `output/screenshots/owners.jpg`.

## Save and Apply connection recovery, 14 October 2026

Draft saves and Apply to Sonne now retry short network interruptions with a
stable operation identifier. Server receipts are stored with the revision and
verified caller; draft receipts also bind the submitted content. Retrying a
completed operation confirms the existing result instead of creating another
revision, prompt version or backup. Changed drafts and other callers remain
subject to revision conflicts. An already current shared prompt is reused
when applying a personal brief.

- **44 Node.js tests passed.** Added cases cover lost draft and publication
  confirmations, identical retry payloads, persisted receipts after restart,
  different caller/content/revision rejection, bounded retries, unchanged HTTP
  validation errors and readable network-failure messages.
- An isolated Node.js 22 Docker browser fixture deliberately discarded a
  draft-save confirmation, disconnected a shared publication before the write
  and discarded a personal publication confirmation after the write. The page
  recovered and displayed successful publication. Stored revisions, versions
  and backup counts confirmed one result per logical operation. A subsequent
  explicit apply reused the already published shared context.
- The web image deployed to the existing stack and became healthy. The new
  browser request module is included in the static asset allowlist. No test
  prompt was applied to the live user workspace or sent to Discord.

The original intermittent report coincided with a web container replacement;
the live health endpoint was responding when checked. A continuously
unavailable server still produces a failure message and keeps the open draft.

## Shared information delivery planning, 14 October 2026

**Sonne & team → Urgent tasks** now stores a shared, ordered delivery plan.
Each entry has information, a recipient discipline, an optional provider and
date, a dependent task and a delivery status. The first unfinished entry is
the next recipient. Delivered entries remain visible and are skipped.

- **33 Node.js tests passed.** New checks cover migration from older shared
  data, private request preservation, invalid plan records and dates, limits,
  priority order, completed entries, access by two Discord profiles, revision
  conflicts, persistence after restart and publication of the planning context.
- An isolated Node.js 22 Docker browser fixture used synthetic Alice and Bob
  identities. Alice added two deliveries, reordered them with arrows and by
  dragging, marked one delivered and applied the prompt. Bob saw the same
  order and statuses. The saved JSON and shared `PROMPT` matched the UI,
  including the next recipient and dependent task.
- The updated live page at `http://localhost:9080` was checked in preview,
  including the delivery form on the smaller browser viewport. The web
  service became healthy. Test entries and prompts were confined to the
  isolated fixture; no real Discord messages were sent.

Older personal lists remain private under Earlier requests when present and
are not copied into the team plan. The team chooses the order. Sonne's prompt
asks it to consider dependencies, dates, blocked tasks and parallel work; this
feature does not compute an optimal schedule or deliver data automatically.
Publication continues to require Apply to Sonne.

## Team workspace and visual identity, 14 October 2026

The existing Docker application at `http://localhost:9080` now follows the
supplied Prompting Sonne structure. It provides five disciplines and three
sections: Sonne & team, Project and [Discipline]’s profile. Shared team and project
context is separate from personal Discord profiles.

The profile label follows the selected discipline in the sidebar, heading and
tab-list label, and updates immediately when the discipline changes. All five
labels, the unselected fallback and the longer mobile label were checked in
the browser; all 29 existing Node.js tests passed. Multiple people in the
same discipline keep separate profiles tied to their Discord accounts.

- **28 Node.js tests passed.** Added coverage verifies shared project access,
  personal information priorities and notes, verified history authors,
  previous and current units, safe CSV output, shared original files,
  persistence, older profile migration and combined sender prompt selection.
- A browser test against an isolated container used synthetic Discord
  identities. Alice saved a personal objective, edited a shared project,
  uploaded a Markdown source, added its category and description, published
  both prompt scopes and exported a backup after reload. The export contained
  the original file, shared data, project history and personal brief. Bob saw
  the shared project and file while his personal goals remained empty.
- The published shared and personal prompt paths and next-turn hook behavior
  were checked with local HTTP and filesystem fixtures. No test sent a real
  Discord message or applied fixture data to the live installation.
- The updated image deployed to the existing Ubuntu stack. OpenClaw
  configuration validation passed without warnings. Runtime inspection
  reported the `before_prompt_build` hook without diagnostics. The saved
  shared agent instruction hashes matched the pre-update private backup.
- The live page was inspected in the browser. Computed styles matched
  Playfair Display and `#5e4b3b` headings, Lato and `#676360` body text,
  `#f9f5e8` background and `#e1dbc9ff` selected tabs. The supplied sun logo
  loaded at its original 640 × 640 resolution. Public image assets are made
  readable for the Compose service's configured user ID.

The public preview uses temporary, blank data and never loads authenticated
project state or publishes prompts. Preview editing, reordered information
needs, project history and numeric charts were checked on the same page.
PDFs, spreadsheets and images remain described references; their contents
are not automatically extracted. Survey-based starter priorities and custom
discipline portraits have not been supplied.

## Initial OAuth credential configuration, 12 October 2026

The main installer now collects the OAuth2 Client Secret in the initial
credential phase alongside the bot token and Discord IDs. It also collects the
web address, defaulting to `http://localhost:9080`. The Prompt Studio helper
uses these saved settings without a second configuration prompt.

- **Five installer credential tests passed on macOS**, using the pinned core
  configuration and templates. A terminal test entered both secrets, all
  required IDs and the web address in one sequence and confirmed that neither
  secret was echoed.
- Full unattended configuration rejects a missing OAuth secret before writing
  `.env` or agent configuration. Preparation can omit the secret and later
  complete it. Invalid secrets and invalid public HTTP origins are rejected.
- Reruns reuse the saved settings without prompting, preserve existing bot
  credentials and retain mode 0600 for `.env`. Conflicting supplied secrets
  leave existing credentials intact.

These checks use synthetic credentials and do not configure or authorise a
real Discord application. The redirect URI still needs to be registered in
the Discord Developer Portal.

## Discord sign-in, 11 October 2026

Prompt Studio now uses Discord OAuth2 with the `identify` scope. Verified
Discord IDs select the existing personal profiles. Access-code login and
access-code sessions are no longer accepted.

- **23 Node.js tests passed.** OAuth coverage includes browser-bound state,
  callback replay, cancelled sign-in, unapproved accounts, upstream failures,
  secret handling, server-side logout revocation, canonical redirects and
  HTTPS cookies. Profile, file, prompt and revision isolation tests also pass.
- **13 Python tests passed on Ubuntu 24.04 ARM64**, using the complete pinned
  source fixture and updated installer. The additional OAuth configuration
  check imports optional settings, preserves existing bot and gateway
  credentials and rejects conflicting secrets without replacing `.env`.
- An isolated Docker browser fixture exercised the new sign-in button,
  simulated Discord consent, account identification, prompt editing and
  application, logout, a second user's empty profile and denial for an
  unapproved account. The applied text was verified in Alice's mounted
  `PROMPT`; Bob had no active prompt. Discord identity responses were synthetic.
- The updated web image built and deployed to the existing Ubuntu runtime.
  OpenClaw configuration validation passed without warnings, and all three
  services became healthy. The shared `SOUL.md` and `AGENTS.md` hashes and the
  existing profile count were unchanged. No test prompt was applied to the
  live installation.
- The hidden terminal setup prompt was checked on macOS and through the
  Ubuntu VM terminal, using synthetic credentials. It saved the expected
  callback and private settings without echoing the secret.
- The live endpoint at `http://localhost:9080` rejects unauthenticated workspace
  requests with HTTP 401. Its private OAuth configuration has mode 0600 and
  the callback is `http://localhost:9080/auth/discord/callback`.

The live installation has no OAuth2 Client Secret yet, so its sign-in button is
disabled with an administrator setup message. Real Discord authorization has
not been verified. It requires the administrator to supply that secret and
register the callback in the Discord Developer Portal. The setup helper and
English README cover this step.

## Personal Prompt Studio profiles, 11 October 2026

Prompt Studio now runs in the Sonne Docker stack with one authenticated profile
per permitted Discord user. The main installer prepares profiles, installs the
OpenClaw plugin and starts the web service automatically.

- **18 Node.js tests passed.** Coverage includes account authentication, forged
  cookies, cross-user data and file separation, concurrent applications,
  persistence after restart, trusted-sender prompt selection, stale revisions,
  invalid imports, source validation, write protection and repeated setup.
- **12 installer/configuration tests passed on Ubuntu 24.04 ARM64** after the
  studio integration. Preparation still uses neither sudo nor Docker, and
  model selection and existing credentials remain intact.
- Deployment to the existing Ubuntu Docker runtime passed OpenClaw 2026.9.8
  configuration validation with no warnings. Runtime plugin inspection reported
  `sonne-personal-prompts` loaded, a registered `before_prompt_build` hook and
  no diagnostics. OpenClaw, Ollama and Prompt Studio were healthy.
- The live web endpoint returned a successful health check and rejected an
  unauthenticated workspace request with HTTP 401. The configured allowlist
  generated one profile; its access-code file has mode 0600.
- Browser checks against an isolated Docker fixture exercised two synthetic
  profiles: sign-in, draft editing, application to an actual mounted `PROMPT`,
  sign-out, account separation and session persistence after container
  recreation. Desktop and 390-pixel mobile layouts were visually checked,
  including mobile sign-out.
- The production `SOUL.md` and `AGENTS.md` hashes matched their pre-enablement
  values. No test prompt was applied to the production agent.

The sender-selection hook was tested offline and loaded in the running gateway.
A real Discord request using a personal prompt has not yet been verified. The
prototype separates web profiles and active prompts; shared Discord history
and the agent file mount are not independent private user sandboxes. See the
[Prompt Studio README](../prototypes/prompt-studio/README.md) for account access,
network configuration and these limits.

## Automated model selection, 8 October 2026

Checked on macOS / Apple Silicon and Ubuntu 24.04 / Linux ARM64. The automated
installer offers `qwen3.5:2b-q4_K_M` and `gemma4:e2b-it-qat`; the manual template
remains Qwen-only. Profile settings and source links are in [models.md](models.md).

- **12 tests passed on Ubuntu 24.04 ARM64.** These cover numeric Discord IDs,
  secret references, private file permissions, complete model routing, CPU and
  context settings, Compose resource overrides, repeated configuration,
  preservation of user files and the gateway token when switching, migration
  of the old generated override and refusal to overwrite a custom override.
- The real Linux `--prepare-only` CLI was exercised for the default choice,
  explicit Gemma selection, reuse of the saved choice and switching back to
  Qwen. A pseudo-terminal selected Gemma through the interactive menu. Invalid
  choices were rejected. Stubbed sudo/Docker commands ensured preparation did
  not invoke either tool. The Gemma RAM guard rejected an 8 GiB host before
  creating the destination or invoking sudo.
- Generated configurations for **both profiles** passed the actual pinned
  OpenClaw `2026.9.8` CLI: `valid: true`, `warnings: []`.
- Docker Compose normalized both generated overrides. Qwen uses 4 GiB for
  Ollama and a 65,536-token context; Gemma uses 8 GiB and 32,768 tokens.
  OpenClaw remains capped at 2 GiB. Memory/swap limits match each service's
  memory cap, and both profiles select native Linux ARM64 images on this host.
- The English automatic-install PDF has **four pages**, includes model
  selection and both RAM requirements, and retains the user-supplied Figure 10.
  It was exported with pdfLaTeX; changed pages were rendered with Poppler and
  visually checked. The build produced no overfull-box warnings.
- **Gemma text and absolute-path file checks passed through the pinned
  OpenClaw CLI.** A disposable Ollama `0.40.0` backend on Ubuntu ARM64 used two
  CPU cores and a 6 GiB memory cap. It reported native completion, vision and
  tool capabilities. The text probe returned exactly `sonne-ok`. A headless
  agent turn made one `write` and one `read` call with no tool failures; the
  expected file was independently read from disk and contained `SONNE FILE OK`.
  A preceding relative-path request did not leave a verifiable file at the
  checked location, so the guide's file example now uses an absolute path.
- **Gemma image input worked, but the strict image acceptance check did not
  consistently pass.** An initial response identified the red shape while
  omitting the label. An explicit two-part prompt read `SONNE 42` but called the
  square a rectangle. This is recorded as a model-output limitation, not a
  successful image acceptance test. The guide still requires both details to
  be correct when checking a deployment.
- Observed Gemma CLI wall times were approximately 6 seconds for the short
  text probe, 31 seconds for an image description and 46 seconds for the final
  file write/read turn. Backend memory after the final file check was about
  **5.0 GiB**; this was a snapshot, not a peak-memory measurement. These small
  synthetic checks do not establish throughput or full-context RAM fit.
  The disposable backend and temporary agent state were removed after testing;
  no test response was delivered to Discord.

These configuration checks do not establish peak RAM use with a full context,
performance on amd64, or completion of a fresh 16 GiB Gemma installation.
The earlier manual-profile checks below remain a historical record.

## Historical manual-profile checks, 7 October 2026

Date: **2026-10-07**. Authoring host: macOS / Apple Silicon.
Deployment target: **Ubuntu 24.04 LTS / Linux amd64 / CPU only / 8 GB total RAM**.
Revision 3 runtime checks: **Docker Desktop 4.72.0 / Engine 29.4.2 / VirtioFS**,
using the pinned Linux amd64 image on an Apple Silicon host (emulation).

### Verified locally

The current preset requests a 65,536-token (64k) context in both OpenClaw and
Ollama. This is a configuration change; full-context inference and memory fit
under the unchanged 4 GiB / 2 GiB caps have not been measured.

- **OpenClaw 2026.9.8 CLI** reports commit `fc23bc8`.
- Generated JSON validated with the actual pinned CLI using synthetic tokens and IDs.
- Installed official **`@openclaw/discord@2026.9.8`** into isolated temporary state,
  then regenerated the template config and validated it again: **`valid: true`,
  `warnings: []`**. Regeneration retained plugin discovery because installation
  records and files live in persistent state, separately from the template JSON.
- The JSON declares image input and native Ollama API, explicitly bounds runtime
  context and output, disables GPU use and has no cloud fallback.
- **Docker Compose 5.1.3** normalized the file successfully. Configuration uses
  Compose v2-compatible features; execution with Compose v2 was not tested here.
- Normalized Compose has 4 GiB and 2 GiB memory/swap limits, no Ollama published
  port, and only `127.0.0.1:18789` published for the gateway. The prompt directory
  is mounted read-only at `/workspace`, with a separate writable directory mount
  at `/workspace/files`. State is mounted separately. Both services select `linux/amd64`.
- Official image manifests contain Linux amd64 images. The observed identities
  are recorded in [versions.json](versions.json).
- **6 generator tests passed**. They check multiple-user routing, invalid/wildcard
  IDs, secret references, private file permissions, preservation of the generated
  gateway token on rerun, and leaving state untouched after incomplete input.
  Environment values are parsed as data rather than executed as shell text.
- **6-page PDF, revision 5**, authored in standalone LaTeX with 15 numbered
  installation steps. Exported with the existing local pdfLaTeX compiler,
  text extracted with pypdf, and
  every page rendered with Poppler and visually reviewed. Code remains selectable;
  clickable source links are present. Text geometry was also inspected for footer
  clearance; the final layout has no clipped code or overlapping content.
  The earlier ten-page Markdown guide is retained as extended notes. The PDF
  export script now compiles `docs/guide.tex` and requires no Python packages.
- Revision 2 adds complete host-tool installation for fresh Ubuntu 24.04 amd64:
  Git, Python, editor, download/certificate support, monitoring tools, SSH client,
  Docker Engine and Compose. Docker repository and post-installation steps were
  checked against official Docker documentation. Bash code blocks passed
  syntax checks. Host apt installation and `hello-world` were not executed here.
- Revision 4 targets any user of the public project: ordinary HTTPS cloning,
  no GitHub login or token, user-relative paths and a user's own Discord setup.
  The public repository visibility and anonymous download were checked.
- Reproduced the original nested file-bind `mountpoint ... is outside of rootfs`
  failure in a disposable Compose project using the real pinned OpenClaw image.
  The revision 3 directory-mount layout starts successfully on the same Docker
  daemon. `tests/check_mounts.cjs` passes inside that container: both prompts are
  readable, writing or renaming either fails with `EROFS`, and temporary files
  can be created, read and deleted under `/workspace/files`. Config and runtime
  workspace paths match. This starts Node only, not a Discord gateway or model.
- Fixed npm cache permissions for host UIDs that differ from the image's node
  user (tested UID 501). `NPM_CONFIG_CACHE` now points inside writable persistent
  state, instead of the image-owned `/home/node/.npm`. The generator also creates
  a private runtime cache, mounted at `/home/node/.cache`, for OpenClaw's secure
  temporary-directory fallback. Both caches pass the container write check.
  See the official
  [npm configuration reference](https://docs.npmjs.com/cli/v11/using-npm/config/).
- Installed the official pinned Discord plugin in the real Docker image with
  synthetic tokens and regenerated config from the final template. A separate
  one-off container validated that config: **`valid: true`, `warnings: []`**.
  Plugin discovery survives between one-off containers through persistent state.

### Commands used

```bash
python3 -m unittest discover -s tests -v
docker compose --env-file tmp/qa/validation.env config --quiet
docker compose --env-file tmp/qa/validation.env config --format json
docker manifest inspect ghcr.io/openclaw/openclaw:2026.9.8
docker manifest inspect ollama/ollama:0.40.0
npm exec --yes --package=openclaw@2026.9.8 -- openclaw --version
```

For the CLI checks, `OPENCLAW_CONFIG_PATH` and `OPENCLAW_STATE_DIR` were directed
to ignored temporary paths. Synthetic `DISCORD_BOT_TOKEN` and
`OPENCLAW_GATEWAY_TOKEN` values were supplied. In that isolated environment:

```bash
npm exec --yes --package=openclaw@2026.9.8 -- openclaw plugins install \
  @openclaw/discord@2026.9.8 --pin --accept-capabilities --force
npm exec --yes --package=openclaw@2026.9.8 -- openclaw config validate --json
```

No real bot was created, contacted, or logged in during these checks.
The npm cache and temporary plugin installation are not repository contents.

### Not executed in that historical run

Docker was unavailable for revisions 1 and 2; revision 3 adds real one-off
container checks on Docker Desktop. No real Discord connection or model inference
was used in validation. The 8 GB Linux target was not provided. None of the
following is claimed as passing:

- Full gateway startup, migrations, health and readiness.
- Recovery of every pre-existing failed plugin migration; fresh-state plugin
  installation and schema checks do not establish that recovery path.
- Ubuntu package installation, Docker service setup, group membership and
  `hello-world` on a fresh Linux host.
- CPU text/vision inference or model tool-call reliability.
- Discord delivery, live user/channel restrictions and file actions.
- OpenClaw tool-level filesystem escape refusal (OS mount protection is checked).
- Persistence after a real container restart.
- Peak process/host memory, absence of swapping, or response speed on 8 GB.

Follow guide pages 7 and 8 on the target host. A passing schema and a 1.9 GB model
download do **not** establish whole-agent RAM fit or tool reliability. If the
profile fails, keep that outcome in the deployment record instead of treating
unmeasured hardware compatibility as guaranteed.
