# Ridwan Khondoker — Portfolio

The personal site of Ridwan Khondoker (Khondoker Ridwan Mahin), software engineer and project manager at Tribe Marketing and Happy To Deliver. It is live at ridwankhondoker.dev. Goals, in order: show the work, wow with motion, bring in leads, tell the story.

## Stack
- Astro 5 (static output), TypeScript strict
- GSAP + ScrollTrigger for scroll-driven motion, Lenis for smooth scrolling (`src/scripts/motion/core.ts`)
- Spline `<spline-viewer>` (pinned 2.0.57) for the hero robot, which is the only 3D on the site. No Three.js.
- Fonts self-hosted via @fontsource: Chakra Petch (display), Inter (body), JetBrains Mono (HUD labels), Doto (the name)
- Deploy: Railway (Railpack) from `main` using `railway.json` (`npm run build`, then `npm start` → `serve dist`)

Do not add another framework, CSS library or animation library without asking.

## Commands
```bash
npm run dev          # local dev server
npm run build        # production build into dist/
npm run check        # astro check (types) — must be clean
npm start            # serve dist/ (what Railway runs)
npm run capture      # screenshot client sites into src/assets/shots (needs their domains reachable)
```

## Where things live
- `src/content/dev/*.md`: development work. The flagship has no `parent`; sub-apps and integrations set `parent: <flagship id>` and render nested inside its case study. `draft: true` means Ridwan hasn't confirmed the write-up yet.
- `src/content/clients/*.json`: project-management / marketing clients (light grid, not deep dives).
- `src/data/tech.ts`: the logos on the /technologies sphere (simple-icons; add or remove entries there).
- `src/data/site.ts`: name, email, socials, profile facts, stats. Add socials there and the menu and footer pick them up.
- `src/assets/shots/<slug>-{desktop,mobile}.webp`: written by `scripts/capture.mjs`. A card without a shot shows a styled placeholder.
- `src/assets/portrait/portrait.*` (About section) and `src/assets/portrait/face.*` (split BUILD/PROJECTS section): drop the photo in and it replaces the placeholder.
- `src/assets/portrait/face-build.*` and `face-projects.*`: transparent half-busts (robot left, Ridwan right) that meet at the BUILD/PROJECTS seam. When both exist they take over from `face.*`; they share one height, so keep the eye lines level in the source files.
- `src/assets/portrait/feature.*` (16:9, ~2560×1440) and optional `feature-mobile.*` (9:16): the full-screen photo band after BUILD/PROJECTS, which slides up over that section.
- `src/components/Logo.astro`: the RK monogram as an inline SVG (takes `currentColor`). `public/favicon.svg` is the white mark on a violet tile; `favicon-32.png` and `apple-touch-icon.png` are rendered from it.
- `public/assets/nexbot.splinecode`: the robot scene. The preloader downloads it once and hands the viewer a blob URL.

## Design rules
- Palette: black / paper-white, neon purple (`--violet`) as the accent, gold only for highlights. **No CSS gradients.** Glows are blurred solid shapes; patterns are SVG tiles.
- The page flips between dark and light themes: every section declares `data-section-theme`, and `motion/theme.ts` sets `html[data-theme]`. Use the role tokens (`--bg`, `--fg`, `--muted`, `--line`, `--accent-text`, `--gold-text`), never raw colours that only work on one theme.
- Don't use tracked-out all-caps eyebrows. Labels use the `.label` HUD style (sentence case, monospace). Big uppercase is only for display headings.
- Don't use numbered markers unless the content really is a sequence.
- Motion: one orchestrated load (preloader → robot → UI reveal); everywhere else, scroll-scrubbed or interaction-triggered. Don't scatter fade-ins on every section.
- Every effect needs a `prefers-reduced-motion` path (no preloader, no pinning, content fully visible) and a touch path (no hover-only content).
- Keyboard: everything interactive is reachable and has a visible focus state.

## Content rules
- Always write the company name as "Happy To Deliver" (capital T in To).
- Only state facts Ridwan has given. Don't invent results, dates or client details. Unknown URLs show "Link coming soon".
- Stats: 7 years in project management & marketing, 3 years in development, 2 companies. The projects count is derived from the content files.

## How to work
- Run `npm run check` and `npm run build`, and look at the pages in a browser (desktop and ~390px wide) before saying a change is done.
- Small, reviewable commits, one concern each.
- `main` is the live site. Work on a branch and push to `main` only when Ridwan approves.
