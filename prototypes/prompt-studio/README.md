# Sonne Prompt Studio

Prompt Studio runs inside the existing Sonne Docker stack at <http://localhost:9080>. One installation serves one team and one shared project. Each permitted Discord account also has a personal profile. All users share the existing local model.

The interface is in English. It follows the supplied “Prompting Sonne” structure: five disciplines and three main sections.

Sonne’s studio context also requires English replies, including when the current Discord question is written in another language. The Team River test workspace uses English briefs, requests, priorities, owner feedback and file content.

## Workspace

Choose **Architect**, **Structural engineer**, **MEP**, **Construction manager** or **LCFM** on the home screen. This sets the discipline in your personal profile; it does not change your Discord permissions.

The home screen shows **Your team’s assistant** above the team name, initially **River Team**. Click the name or its pencil icon to rename the team, then select **Save name**. Signed-in changes are validated and saved in the shared Docker data, survive restarts and are visible to every team member after reloading. The same name appears in **Sonne & team → Purpose** and in the shared prompt when you apply it. Names must contain 1–300 characters. Existing saved team names are preserved.

| Section | Contents | Who can see and edit it |
| --- | --- | --- |
| **Sonne & team** | Team name, owners’ requirements and feedback, Sonne’s character and tasks, shared information delivery priorities, deadlines, values, technology, sustainability and IPD challenges | Every permitted team member |
| **Project** | Brief, location, floor area, volume, construction duration, itemised costs, environmental estimates, project files and change history | Every permitted team member |
| **[Discipline]’s profile** | Introduction, personal goals and values, priority folders for other disciplines, earlier personal requests, discipline notes and personal files | Priority folders are shared with the team; other profile content belongs to the signed-in Discord account |

The profile label follows your selected discipline, for example **Structural engineer’s profile**. Each Discord account keeps its own profile, including when several team members choose the same discipline. Before a discipline is selected, the label is **Profile**.

**Sonne & team → Owners** shows five rows: **Architecture owner**, **Structural engineering owner**, **MEP owner**, **Construction owner** and **LCFM owner**. These owners are separate people from the team members who use Sonne. Each row has an editable **Name Surname** field and a space for that owner’s requirements and feedback, without a profile portrait or link. Entries save automatically to Sonne’s memory and survive restarts; they are excluded from **Review prompt** and the applied brief. Name and feedback edits appear in **Project → History** and CSV with their time, verified author and previous and current values. The saved memory distinguishes owners from team members, including a construction worker, and keeps owner requirements separate from personal preferences. Selecting a discipline or editing an owner record does not assign ownership to a Discord account. Existing workspaces start with blank owner fields; existing owner entries are preserved in memory.

The **Connection** tab shows the server address, prompt-storage status, Discord sign-in configuration and source repository. Server credentials remain in the installer’s private configuration. The repository link is a reference; the app does not hand prompts off to Git.

The sign-in page also offers **Explore the workspace**. This opens the same interface with blank, temporary data. Preview changes stay in the current tab, disappear on reload and never read or modify authenticated profiles or publish a prompt.

## Shared information delivery priorities

In **Sonne & team → Urgent tasks**, select **Add request**. Choose **Information** or **Action**, enter what is needed, the recipient discipline and the task it unlocks. Choose the provider when known and add an optional needed-by date. Information uses **Awaiting data**, **Ready to share** and **Delivered**; actions use **To do**, **In progress** and **Completed**.

Drag deliveries or use their arrows to set one shared order for the team. **Next recipient** shows the first unfinished delivery; completed deliveries stay in the list and are skipped. The plan supports 30 deliveries, with up to 300 characters each for the information and dependent task. Everyone with access can edit it. Changes use the shared revision checks and survive a service restart.

Select **Review prompt → Apply to Sonne** to publish the plan with the shared brief. Sonne receives the order, recipients, providers, task dependencies, dates and statuses. Its planning instructions ask it to identify blocked tasks, suggest work that can proceed in parallel and flag conflicts between priorities and deadlines. The order is chosen by the team; this feature does not calculate an optimal schedule or send data to recipients.

Each compiled request has an ID, an explicit provider → recipient direction, its exact deadline, a completion flag and a flag indicating whether this request still blocks its dependent task. **Ready to share** is not **Delivered**; **To do** and **In progress** are not **Completed**. Only a delivered/completed request removes its own block; other dependencies may remain. Project milestones and earlier assistant replies do not change request deadlines or completion. These facts are computed from the applied plan before the model receives it.

For a clear question about urgent tasks, next work or task status, the hook supplies a shorter context containing the sender’s anchor and the applied plan’s computed facts. Questions mentioning budgets, owners, files or personal preferences retain the complete context. The full facts table follows personal notes and project memory in other requests. This helps the small local model keep role direction, task status and dates separate; it does not guarantee every generated answer is correct. Priority order does not create dependencies between requests, and discipline owners are not automatically assigned as providers.

Earlier private lists remain in **[Discipline]’s profile → Earlier requests** when present. They are not automatically copied into the shared plan. Their priority applies to the individual sender; the shared plan determines the team’s delivery sequence. Editable starter suggestions remain available there.

## Discipline priority folders

Open **[Discipline]’s profile → Priorities** to find a folder for each of the four other disciplines. For example, the Architect profile has **Structural engineer**, **MEP**, **Construction manager** and **LCFM** folders. Every discipline gets the same arrangement, excluding itself.

Open a folder and select **Add request**. Choose whether you need information or an action, describe the request, identify the task it unlocks and optionally set a needed-by date. The recipient and provider are set by the folder. Edit requests to update their status; completed requests remain visible and are skipped when showing the next need.

Drag requests or use the arrows to prioritize them within a folder. These are the same shared requests shown in **Sonne & team → Urgent tasks**, so edits and ordering carry through both views. Reordering a folder preserves other requests’ positions in the shared plan. The 30-request allowance covers the whole shared plan, including the folders. Team requests without a provider remain in Urgent tasks until a provider is assigned.

Folders belong to the discipline, so people choosing the same discipline see the same priorities. Personal goals, earlier private requests, notes and files stay attached to the individual account. Changing disciplines shows the new discipline’s folders without deleting any requests.

Apply the prompt to give Sonne the information and actions, priority order, providers, task dependencies, dates and statuses. Sonne is instructed to work backwards from dependent tasks and needed-by dates for pull planning, identify blocked work and propose work that can proceed in parallel.

**Your information** accepts separate titled notes. **Files** stores the originals and their descriptions. Changing your discipline does not delete earlier notes or files.

## Project values and history

The shared project records floor area in m², volume in m³ and construction duration in days, weeks or months. Costs are separated into structure, interiors, finishes, building services and other costs, with one selected currency. Carbon, energy and annual solar gain each have an explicit unit.

**Project → Monitoring costs** has a **+** beside **Other costs**. Use it to add a category name and an optional amount. Edit a category with its pencil, change amounts directly or remove a category with its ×. Up to 30 named categories share the project currency and contribute to the entered total alongside the standard costs and the existing uncategorised Other costs amount. Categories save to Sonne’s project memory and retain their name and amount changes in History and CSV. History can chart each category, including earlier values of removed categories, while keeping currencies separate.

Drafts save as you edit. Each accepted change to a project field or owner name or feedback records the time, verified Discord author, previous value and new value. History is created by the server; a browser cannot supply its own author or fabricated history. Concurrent edits use revision checks. A stale browser must export its draft or reload instead of silently replacing another person’s work.

**Project → History** charts the selected numeric field. It keeps different units and currencies separate. **Export CSV** includes the full recorded field history, with previous and current units, for spreadsheets and external plots. The interface shows the most recent 30 updates. Storage accepts up to 2,000 updates or 8 MB of history, then requires an operator archive; it does not silently discard older records.

Performance charts show entered estimates, not a building-performance simulation. Values are only as reliable as the information supplied by the team.

## Project brief and Sonne’s memory

**Project → Brief** contributes the project name, stage, brief, location, floor area, volume, construction duration and other brief information to **Review prompt** and **Apply to Sonne**. Shared team instructions and personal preferences keep their existing prompt scopes.

**Owners**, **Performance**, **Monitoring costs**, **Files** and **History** save automatically to persistent project memory. They are available to Sonne on the next permitted Discord turn without applying a prompt. Saving updates `.state/prompt-studio/active/shared/PROJECT_MEMORY.json` and makes the original shared files available to the bot. The complete memory is mounted read-only at `/workspace/files/prompt-studio/shared/.sonne-memory/PROJECT_MEMORY.json`, inside Sonne’s permitted workspace.

The hook loads a current summary of up to 20,000 characters on each turn. The full JSON retains all owner names and feedback, performance values and units, standard and custom costs, file descriptions and text extracts, and the complete recorded history. Long owner feedback is marked as an excerpt in the summary, with a pointer to the full record. Current owner records take precedence over older entries in history. Sonne can read the full memory or original files when needed. Historical brief edits remain history and do not activate a draft brief. Memory is restored from saved shared state after a restart. A failed memory write rolls back the draft save and reports that it was not saved.

## Files and backups

Project files are shared. Personal files remain attached to the signed-in profile in the web app. Categories include room schedule, site plan, design brief, constraints and discipline information. Open a file to add its description and relevance or download its original.

Each scope accepts up to 20 files, 10 MB per file and 30 MB total. TXT, MD, Markdown, CSV and JSON contribute text excerpts of up to 12,000 characters. PDFs, Excel workbooks and images are stored as references. This prototype does not automatically extract their contents, run OCR or calculate values from them.

**Account & backup → Export backup** downloads shared data, your personal brief, project history and original files in one JSON file. Keep it private. **Import profile** restores only the personal portion, after confirmation; it does not replace the team’s shared project. Older personal project exports are also accepted.

Earlier four-discipline profiles retain their fields, files and versions. They appear as an **Earlier discipline brief** and remain in the personal prompt. Older personal project information is not automatically made public to the team. The operator can restore shared state from a private filesystem backup when needed.

## Apply to Sonne

Select **Review prompt** to inspect the shared team context and your personal brief, then **Apply to Sonne**.

The server recompiles the saved data and publishes:

- Shared team instructions and Project → Brief to `.state/prompt-studio/active/shared/PROMPT`.
- Your personal brief to `.state/prompt-studio/active/<discord-user-id>/PROMPT`.
- Personal originals to `workspace/files/prompt-studio/<discord-user-id>/…`. Shared originals become available when the project draft saves.

Shared updates affect every permitted team member. Personal updates affect only that Discord sender. Brief drafts and publication are separate: autosaving does not change the active brief. Other project sections update saved memory automatically. Previously applied briefs are refreshed with **Apply to Sonne**.

The OpenClaw plugin reads both active briefs and current shared project memory for each Discord turn, using the trusted sender ID supplied by `before_prompt_build`. It does not identify users from message text or mentions. Unknown senders, other channels and background turns receive no studio context. Updates become available on the next request; an already running response keeps its original context.

**Review prompt**, **Copy** and **Apply to Sonne** include the signed-in account’s Discord user ID and native `<@USER_ID>` mention in its personal brief. The server uses the verified session, so imported profile data or browser-supplied account fields cannot choose another person’s anchor. The hook also supplies the current sender’s anchor on every permitted Discord turn, including before any brief is applied and for previously published briefs. Saved project history includes each verified author’s mention so Sonne can refer to specific team members even when their names or disciplines match. Discipline owners remain separate from these accounts. Preview mode has no authenticated account and adds no account anchor. Mention syntax follows the [Discord message formatting reference](https://docs.discord.com/developers/reference#message-formatting).

Shared and personal publication each use revision checks, a 40,000-character limit, atomic file replacement and a backup of the previous prompt. The app publishes shared context first, then the personal brief. If the second operation fails, it explicitly reports that shared context was applied and the personal brief was not. Personal prompt versions retain the combined published context; the most recent 30 versions are kept.

Draft saves and **Apply to Sonne** retry short network interruptions up to two times. If a save or publication completed but its response was lost, the server confirms that same operation without creating another revision, prompt version or backup, including after a service restart. A changed draft or another user's operation still requires a fresh revision. Already published shared context is reused while applying a personal brief. If the connection remains unavailable, the page keeps the draft and displays a retry message; it does not claim that publication succeeded.

The integration appends context subject to the existing persona, working rules and tool policy. It preserves `SOUL.md` and `AGENTS.md`. See the pinned OpenClaw [hook context](https://github.com/openclaw/openclaw/blob/v2026.9.8/src/plugins/hook-types.ts) and [prompt result contract](https://github.com/openclaw/openclaw/blob/v2026.9.8/src/plugins/hook-before-agent-start.types.ts).

Personal web profiles do not create private agent sandboxes. Messages and history in the same Discord channel remain shared, and the agent’s existing file tools can access the shared file mount.

## Automatic installation and Discord sign-in

Run `scripts/install-sonne.sh` from the complete source checkout. It collects the bot token, OAuth2 Client Secret, Discord IDs and web address in the initial configuration. Both secrets use hidden terminal input. The default address is `http://localhost:9080`. Reruns reuse saved credentials and preserve profile data.

For a full unattended installation, include `DISCORD_OAUTH_CLIENT_SECRET` in the private `--env-file`. Set `PROMPT_STUDIO_URL` there to use another address. `--prepare-only` permits an empty secret for preparation, leaving sign-in disabled.

In the [Discord Developer Portal](https://discord.com/developers/applications), select the application used by Sonne and register this OAuth2 redirect:

```text
http://localhost:9080/auth/discord/callback
```

The app uses the existing `DISCORD_APPLICATION_ID` and the application’s **OAuth2 Client Secret**. Sign-in requests only the `identify` scope and accepts accounts listed in `DISCORD_USER_IDS`. Discord access and refresh tokens are discarded after identity verification. Sessions use opaque HttpOnly, SameSite=Lax cookies, last seven days and are revoked by **Sign out**. Only hashes of session-cookie tokens are stored. HTTPS deployments use Secure cookies. See Discord’s [OAuth2 documentation](https://docs.discord.com/developers/topics/oauth2).

For an existing installation, update the web service and plugin from the source checkout:

```sh
bash scripts/enable-prompt-studio.sh --dir ~/agents/sonne
```

Add `--configure-login` only to configure or change OAuth separately. Add `--prepare-only` to prepare files without running Docker. The helper backs up configuration changes and recreates the web and gateway services. It preserves the existing model and bot credentials.

The settings are stored in the installation’s private `.env` and `.state/prompt-studio/oauth.json`, both with mode 0600:

```dotenv
DISCORD_OAUTH_CLIENT_SECRET=your-oauth2-client-secret
PROMPT_STUDIO_URL=http://localhost:9080
```

Never commit these files. The source checkout must include `prototypes/prompt-studio` and `scripts/enable-prompt-studio.sh`; copying only the main installer is insufficient. Old access codes and access-code sessions no longer grant web access.

## Deployment and account maintenance

The host binding defaults to `127.0.0.1:9080`. For team access from other machines, use an HTTPS reverse proxy that preserves the public Host header. Set `PROMPT_STUDIO_URL` to its HTTPS origin, register the matching `<origin>/auth/discord/callback` in Discord and rerun the helper. The installer does not register a public domain or configure the team network.

Set `PROMPT_STUDIO_PORT` for another host port and `PROMPT_STUDIO_BIND` for another host binding. With SSH forwarding, use the same localhost origin and port registered in Discord.

To add or remove a user, edit `DISCORD_USER_IDS` in the private runtime `.env` and rerun the installer or update the Discord allowlist configuration and helper together. Removed users lose web access and prompt selection after service recreation; their stored projects and files are retained for the operator.

Storage lives under `.state/prompt-studio`:

- `team/current.json`: shared draft, revision, project history and publication metadata.
- `team/files/`: original shared files.
- `profiles/<discord-user-id>/`: personal drafts, originals, versions and backups.
- `active/`: published prompts and shared project memory, mounted read-only in OpenClaw.
- `discord-sessions.json`: private hashed session registry.

To revoke all web sessions, stop Prompt Studio, move `discord-sessions.json` to a private backup and restart the service. For shared-history archiving, stop the service, back up `team/current.json` and its original files, export the history, then clear only the backed-up history array before restarting.

When managing the stack manually, retain the Compose overlays:

```sh
cd ~/agents/sonne
docker compose --env-file .env -f compose.yaml -f compose.override.yaml \
  -f compose.prompt-studio.yaml up -d --build --force-recreate prompt-studio openclaw
```

Omit `compose.override.yaml` for installations without that file. Prompt Studio has no Docker socket, Discord bot token, gateway token or Ollama control access. Its Discord credential is limited to the OAuth2 Client Secret.

## Development and validation

The app uses Node.js 22 and the standard library, with no npm dependencies or frontend build step. Google Fonts supplies Playfair Display for headings and Lato for body text; Georgia and Arial are the fallbacks. The team-supplied sun illustration is the logo. The interface uses brown headings (`#5e4b3b`), body text (`#676360`), a cream background (`#f9f5e8`) and beige menus and tabs (`#e1dbc9ff`).

Production Compose enables profile authentication and supplies `STUDIO_DATA_DIR`, `STUDIO_ACCOUNTS_FILE`, `STUDIO_PROMPTS_DIR`, `STUDIO_AGENT_FILES` and `STUDIO_OAUTH_FILE`. The registry contains numeric Discord IDs and display names. A standalone server without an account registry retains the older single-workspace API for isolated compatibility tests.

```sh
node --test prototypes/prompt-studio/tests/*.test.mjs
python3 -m unittest discover -s prototypes/prompt-studio/tests -p 'test_*.py' -v
node --check prototypes/prompt-studio/dist/app.mjs
bash -n scripts/install-sonne.sh scripts/enable-prompt-studio.sh
```

Tests use temporary directories, synthetic identities and local HTTP requests. They cover OAuth state and sessions, shared project access, personal isolation, recorded authors and units, CSV handling, original files, revision conflicts, migration, publication and the sender-selection hook. The Python tests read the pinned core templates from Git and exercise the initial terminal prompts. No test sends Discord messages or runs inference.
