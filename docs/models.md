# Model selection in the automated installer

Sonne offers two local CPU profiles. Qwen is the default and keeps the existing
deployment settings. Gemma uses a separate memory and context configuration.
Both profiles use the native Ollama API and route conversation, image analysis,
utility tasks and image summaries to the selected model. No cloud model or
automatic fallback is configured.

## Profiles

| Setting | Qwen | Gemma |
| --- | --- | --- |
| Installer option | `--model qwen` | `--model gemma` |
| Exact Ollama tag | `qwen3.5:2b-q4_K_M` | `gemma4:e2b-it-qat` |
| Variant | Qwen3.5 2B, Q4_K_M | Gemma 4 E2B, instruction-tuned QAT |
| Observed download size | About 1.9 GB | About 4.3 GB |
| Host RAM profile | Approximately 8 GiB | Approximately 16 GiB |
| Initial free disk requirement | 15 GiB | 20 GiB |
| Ollama memory / memory+swap limit | 4 GiB / 4 GiB | 8 GiB / 8 GiB |
| OpenClaw memory / memory+swap limit | 2 GiB / 2 GiB | 2 GiB / 2 GiB |
| Configured runtime context | 65,536 tokens | 32,768 tokens |
| Declared model context window | 262,144 tokens | 131,072 tokens |
| Maximum generated output | 1,024 tokens | 1,024 tokens |
| GPU use / thinking | Disabled / disabled | Disabled / disabled |

The Gemma choice specifically uses **Gemma 4 E2B IT QAT**, not Gemma 3n E2B or
the moving `gemma4:e2b` alias. The QAT tag provides a smaller download for this
CPU profile. Model capabilities, quantization and observed download sizes are
listed by Ollama: [Qwen](https://ollama.com/library/qwen3.5:2b-q4_K_M) and
[Gemma](https://ollama.com/library/gemma4:e2b-it-qat), checked on 8 October 2026.
Tags can change upstream; this installer selects exact variant names but does
not pin model-weight digests.

The host RAM values are conservative requirements of these installer profiles,
not upstream minimum specifications or measured peak memory for every task.
The script permits approximately 1 GiB for memory reserved by the operating
system when checking `/proc/meminfo`. Download size excludes runtime context,
image processing, OpenClaw, Docker and the operating system. Full-context
workloads still require measurement on the target host.

Both choices retain the same restricted tools: `read`, `write`, `edit` and
`view_image`. CPU image input is limited to a maximum side of 768 pixels and
262,144 pixels in total. Audio, video, web browsing and shell access remain
disabled. Native tool support does not guarantee that every model answer will
use tools correctly; run the image and saved-file checks in the installation
guide after setup and after switching models.

In the Gemma CPU checks on 8 October 2026, text output and a file write/read
using an absolute path passed. Image input worked, but the initial answer
omitted the large label; a more explicit prompt read `SONNE 42` while describing
the square as a rectangle. The strict image fixture check therefore did not
consistently pass. Use precise questions and verify the returned details.
For file requests, specify `/workspace/files/<filename>` explicitly. A relative
path request did not produce a verifiable file at the checked location;
the absolute-path request created the expected file with the correct content.

## Choose and switch

On a new interactive installation, enter `1` for Qwen or `2` for Gemma at the
menu. Enter accepts Qwen. For an explicit choice:

```bash
cd ~/sonne-installer
bash scripts/install-sonne.sh --model qwen
# Or:
bash scripts/install-sonne.sh --model gemma
```

The runtime installation defaults to `~/agents/sonne`. Its saved selection is
stored privately in `.state/sonne-model`. Subsequent runs keep that selection
unless `--model` overrides it. A new noninteractive run without `--model` uses
Qwen. An invalid choice is rejected before setup changes the installation.

To switch an existing automatic installation, rerun the installer with the
other choice and the same `--dir` if you originally used a custom destination.
The installer checks the new profile's RAM requirement, pauses an existing
gateway, regenerates the configuration and Compose override, downloads the
selected model and restarts the services. It then probes that model through
OpenClaw and checks the Discord connection. User files and existing gateway
and Discord credentials are preserved. A failed run leaves the gateway paused;
fix the error and rerun the same command to complete setup.

Existing model weights are retained in the Docker volume for reuse. The script
does not delete the previous model when switching. Only one model is loaded
at a time, and a model failure does not silently switch to the other choice.
Custom Compose overrides are refused rather than overwritten; the installer's
previous generated override is recognized and upgraded automatically.

Use the installer for later model or Discord changes. Running the pinned
`scripts/configure.py` directly regenerates the manual Qwen template and loses
the automatic model settings. The manual guide and template continue to
describe the original Qwen deployment.

## Prepare without starting services

```bash
bash scripts/install-sonne.sh --model gemma --prepare-only \
  --dir ~/agents/sonne-preview --env-file /path/to/private-discord.env
```

Preparation requires Git and Python 3 and creates local configuration. It does
not invoke sudo or Docker, download model weights, contact Discord or run
inference. Hardware checks are skipped, so successful preparation does not
establish RAM fit. Keep the supplied environment file private; the expected
fields are documented in `.env.example`.

See the [validation record](validation.md) for the checks actually performed.
