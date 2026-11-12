# Design Direction - VaultGate (T3N Build+Scale Edition)

## Project & Purpose
VaultGate is a hardware-sealed API proxy, credential vault, and Remote MCP Server built on Terminal 3 Network (T3N) Trusted Execution Environments. Developers store third-party API keys (OpenAI, Gemini, Anthropic, Resend, Telegram, GitHub, Webhooks) inside a TDX enclave and delegate scoped, revocable access to AI agents (Claude Desktop, Cursor, Hermes) without ever exposing raw secrets to agent runtimes, local configs, or server memory.

## Audience & Vibe Read
Target audience: AI agent builders, MCP power users, backend engineers, and DoraHacks / Terminal 3 grant reviewers.
Tone adjectives: Technical, Surgical, Tactile, Uncluttered, Verifiable.

## Visual Dials (taste-skill)
- DESIGN_VARIANCE: 8 (Asymmetric 12-column grids, split hardware workbench, telemetry strips; zero 3-card equal SaaS rows)
- MOTION_INTENSITY: 4 (Restrained hardware state transitions: LED pulse, boundary seal lock, crisp tab switches; honors `prefers-reduced-motion`)
- VISUAL_DENSITY: 7 (High-information engineering tool density on `/app/*`; generous breathing room on `/` landing)

## Typography (taste-skill)
- Display font: `Space Grotesk` (600, 700, tight tracking `-0.025em`, descender-safe `leading-[1.08]`)
- Body font: `IBM Plex Sans` (400, 500, 600, `leading-relaxed`, max paragraph width `60ch`)
- Technical / DID / Payload font: `IBM Plex Mono` (400, 500, 600, `tabular-nums` on all counters, sequence numbers, and credit balances)

## Color System (Dark Default + Light Toggle)

### Default Theme: Carbon Enclave Deck (Dark)
- Background (`--bg-paper`): `#0B0D10` (matte obsidian)
- Surface / Panel (`--bg-panel`): `#13171D` (machined steel panel)
- Elevated / Code (`--bg-elevated`): `#1A2029`
- Primary Ink (`--text-ink`): `#ECEBE6` (warm off-white instrument ink)
- Muted Ink (`--text-muted`): `#8E95A2`
- Hairline Rule (`--border-rule`): `#252C36`
- Strong Rule (`--border-strong`): `#3A4454`
- Primary Accent (`--accent-seal`): `#E04F26` (hardware seal vermilion - max 1 primary accent)
- Verified Status (`--status-led`): `#22C55E` (enclave verified LED)

### Toggle Theme: Swiss Hardware Manual (Light)
- Background (`--bg-paper`): `#F4F3EE` (warm alabaster)
- Surface / Panel (`--bg-panel`): `#FAF9F5`
- Elevated / Code (`--bg-elevated`): `#EAE8E0`
- Primary Ink (`--text-ink`): `#121417` (carbon ink)
- Muted Ink (`--text-muted`): `#5E5C56`
- Hairline Rule (`--border-rule`): `#D4D1C7`
- Strong Rule (`--border-strong`): `#121417`
- Primary Accent (`--accent-seal`): `#E04F26`
- Verified Status (`--status-led`): `#15803D`

Strict color ban: Zero AI-purple gradients, zero neon glassmorphism blur blobs, zero multi-hue rainbow badges.

## Composition & Canvas
- Wide desktop container: `max-w-[1440px] mx-auto px-5 lg:px-8` with full-bleed `1px` structural border bands.
- Multi-route App Router architecture (never a single-page cram):
  - Public zone: `/` (Overview & Live Boundary Schematic), `/docs` (Architecture & MCP Guide), `/traction` (Public Verifiable Unique DIDs & Cluster Ledger)
  - Auth zone: `/login` (Terminal 3 Email OTP + Local Private Key Sign)
  - App workspace shell (`/app/*` with persistent left rail): `/app` (Control Center), `/app/vault` (Sealed Secrets), `/app/agents` (Delegated DIDs), `/app/wire` (3-Layer Enclave Wire Tester), `/app/connect` (1-Click MCP & CLI Config), `/app/audit` (Cluster Audit Log + CSV Export)
- Hero viewport discipline: `min-h-[calc(100dvh-4rem)]` max, headline max 2 lines, primary CTA and live enclave schematic both visible above the fold.

## Copy Rules (no-ai-slop)
- Zero em-dashes (`—`) and zero en-dashes (`–`) anywhere in markup, docs, comments visible to users, or copy. Use standard `-`, `:`, or clean sentences.
- Banned vocabulary enforced: delve, foster, leverage, utilize, facilitate, empower, streamline, robust, cutting-edge, paradigm shift, game changer, tapestry, realm, beacon, multifaceted, meticulous, intricate, paramount, transformative, elevate, embark, supercharge, harness, ever-evolving, seamless, unleash, next-gen.
- Active verbs, concrete protocol identifiers (`did:t3n`, `z:<tid>:credential-vault`, `seq_no`, `member-delegation-update`), and real metered numbers only.

## Forbidden Patterns
- Single-page-only prototype layouts without onboarding/docs/traction context.
- Cramped narrow centered islands (`max-w-3xl` wrappers on desktop).
- Fake div-art mock screenshots instead of real interactive boundary/wire components.
- Hardcoded mock metrics disguised as live cluster telemetry.
