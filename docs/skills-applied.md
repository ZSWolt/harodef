# How the skills were used

The archive `Skills.rar` contained 470 skill folders. After removing duplicates with identical content (by hash), 467 unique skills remained; the `SKILL.md` of every one was read. Below are the 40 skills that are relevant to a browser game and how each was applied. The rest are not relevant to this project (list at the bottom).

| skill | area | how it was applied |
|---|---|---|
| animejs-2 | Animation | transform/opacity props only (translateX/scale separately); timelines with relative offsets; pause handles on screen teardown; no loop:true for idle (CSS keyframes); stagger 30-50ms |
| claude-design-auditor-skill-main | A11y / RTL | dir=rtl lang=he; logical CSS properties; timer bars fill right→left; numbers/clock stay LTR; 4/8 grid; ≤5 font sizes; focus-visible 2px ring; reduced-motion block |
| frontend-design | Visual direction | Token plan first (TV studio navy, chaser red, contestant blue, gold); no generic SaaS cards; one orchestrated moment per screen; button labels say what they do |
| design-everyday-things-2 | Game UX | Signifiers for what is clickable now; constraints (disable after lock-in); system status always visible (turn, timer, positions, connection) |
| color-expert | Palette | Tokens in OKLCH; hover/active derived with color-mix; contrast checked |
| font-features | Typography | tabular-nums on timers/scores (Rubik supports tnum) |
| feature-factory | Process | No wall-clock in tests (injected `now`); same verify in CI (GitHub Actions runs vitest) |
| clean-code-2 | Code quality | Intent names; named constants (RULES); small functions |
| code-review | Netcode review | Stale messages: late duel answers after reveal ignored; duplicate answers ignored; only host mutates |
| high-perf-browser-2 | Performance | preconnect to fonts/CDN/PeerJS; small first payload, no build step |
| drive-motivation-2 | Game design | Clear progress feedback (points meter, chaser gap); meaningful choice (square 3 vs 5) |
| contextual-commit | Git | Conventional commit messages with intent |
| microinteractions-2 | UI feedback | Fixed durations 100/200/300/500ms; press scale 0.97; wrong-answer shake 300-500ms; big signature moment for catch/escape; sound only alongside visuals; lock answer after first submit; clear mic-listening state |
| modern-web-design-2 | Design system / a11y | Animate only transform/opacity; easing tokens cubic-bezier(0.4,0,0.2,1) / spring (0.34,1.56,0.64,1); prefers-reduced-motion; focus-visible; 44px targets; aria-live for timers/results |
| intended-vs-implemented | Correctness audit | Host-authoritative rules documented and checked: clients send intents only, host validates everything |
| playwright-cli | E2E | Multiple isolated sessions (host + players) for multiplayer smoke tests |
| output-skill | Code completeness | No placeholders/TODOs; full question bank; count deliverables |
| lightweight-3d-effects-2 | Decoration | (optional) not adopted — kept lightweight CSS effects instead |
| refactoring-ui-2 | Visual system | One spacing scale (4/8/16/24/32/48/64 ×1.5 on stage); one hierarchy lever per element, key numbers get all three; off-black not #000; two-part shadows; UI motion ≤400ms |
| top-design-2 | Motion / type drama | Custom easings expo-out cubic-bezier(0.16,1,0.3,1); staggered entrances; ~10:1 display/body contrast on big moments (timer, "נתפס!") |
| soft-skill | Motion performance | transform/opacity only; will-change only while animating; fixed grain layer pointer-events:none; press scale 0.98 |
| taste-skill-v1 | Anti-slop | No emoji in UI; neutral base + Chase blue/red accents; build loading/empty/error/disconnected states; staggered lobby tiles |
| taste-skill | Anti-slop | CSS Grid for lobby/board; font-display swap (Google Fonts with display=swap — no build step on Pages) |
| redesign-skill | Audit | tabular-nums on scores/timers; 200-300ms state transitions; no alert(); real Hebrew copy |
| stitch-skill | Tokens | No pure black; single strong accent per role; no overlapping text |
| web-typography-2 | Typography | Headings lh 1.1-1.25, UI 1.3-1.4; question line 45-75ch; one variable Hebrew font (Rubik) |
| ux-heuristics-2 | Usability | Acknowledge every action (answer locked, connecting/connected, mic listening); plain-Hebrew error messages; 44px targets; exit from every screen |
| web-design-guidelines | Review | Focus states, aria labels, reduced motion, semantic buttons |
| steve-jobs-design-review-2 | Product focus | Polish disconnect/error/empty-lobby/results screens too |
| vitest | Tests | node env for pure logic; deterministic rng; fake time via injected `now` |
| tdd | Tests | Vertical slices: catch, escape, matching with nikud/typos |
| test-scenarios | QA | docs/test-scenarios.md: objective/state/role/steps/expected |
| release-it-2 | Network resilience | Connect timeout; heartbeat to detect dead peers; clear message when host unreachable; cleanup closed connections |
| pragmatic-programmer-2 | Code craft | Single source of truth RULES; separate layers net/game/ui/voice/speech; validate every incoming message on host |
| software-design-philosophy-2 | Module design | Deep modules (net.send hides PeerJS); CSS vars for colors/timings |
| refactoring-patterns-2 | Code quality | Message type constants map instead of raw strings |
| shipping-artifacts | Docs | Short architecture notes in README |
| repo-prep | Repo hygiene | README, .gitignore, LICENSE; confirm before push/gh |
| threejs-webgl | 3D | PBR materials (MeshStandardMaterial), ACES tone mapping and sRGB, pixel ratio capped at 2 and a 2560px buffer, InstancedMesh for the LED wall, shared geometry, no object creation inside the render loop, fixed-step timing with Clock |
| web3d-integration-patterns | 3D + UI | Layered separation: WebGL layer (studio3d.js) under the HTML layer, synced by state (setView) and not the other way around; one owner per animated property (internal tween manager with keys); a dispose function |

## Deliberate deviations
- **taste-skill (self-hosting fonts):** the site has no build step and sits on GitHub Pages, so Rubik is loaded from Google Fonts with `display=swap` + `preconnect`. Font payload: a single variable font.
- **playwright-cli / web-design-guidelines:** testing was done in the built-in browser with several tabs (host + players) and with bots in `?dev` mode, instead of installing Playwright.
- **lightweight-3d-effects-2:** replaced by a full three.js studio, at the user's request. The CSS backdrop remains as a fallback when WebGL is unavailable.

## Skills not relevant to this project (427)
Business, marketing and product strategy (lean-*, jtbd, positioning, pricing, gtm, okr, swot and so on), social content writing (post-*, newsletter, telegram), music and album production (album-*, lyric-*, suno, mastering), image and video generation (muapi-*, remotion-*, ffmpeg, nano-banana, gemini), personal and external-service integrations (gmail, zoom, linear, health, history), other stacks (React/Vue/Nuxt/Three.js/Babylon/GSAP/Tauri/Xcode), research and academic tools (academic-*, researchers-*), and tooling/meta (skill-creator, repomix, session-*). The full list of names is in the working files of the review.
