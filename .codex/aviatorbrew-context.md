# Aviator Brew Codex Context

Last updated: 2026-07-29

## Repository
- Local repo: /home/skynet/aviatorbrew/aviatorbrew-new
- GitHub remote: https://github.com/aviatorbrew/aviatorbrew.git
- Branch: main
- Do not deploy or push to aviatorbrew/aviatorlive for this site.

## Render
- Service name: aviatorbrew / aviatorbrew
- Service ID: srv-d9l287lf1gfc73de388g
- Public Render URL: https://aviatorbrew.onrender.com
- Current production target while DNS is being moved: https://aviatorbrew.onrender.com

## Build And Start
- Build command: npm run build
- Start command for standalone Next output: npm run start
- npm start runs: HOSTNAME=0.0.0.0 node .next/standalone/server.js
- Do not use next start because next.config.mjs uses output: standalone.
- After every build, report .next/BUILD_ID to the user.

## Git And Deploy Workflow
- Commit and push requested site changes to origin main.
- Keep logs/daily-upload.log uncommitted unless the user explicitly asks otherwise.
- The previous daily upload log being uncommitted is expected local runtime noise.

## Current Site Notes
- Manager portal route: /manager
- Manager locations route: /manager/locations
- New Release Alerts route: /manager/beer-release-alert
- Keg/package sales route: /manager/kegs
- Public keg/package page: /kegs
- Public live music links should use https://aviatorlive.beer/live-music

## Media And Data Storage
- Website photo upload API: /api/website-photos
- Website media uploads support images plus short videos: PNG, JPG, WEBP, MP4, WEBM, MOV, and M4V. Videos are gallery media only; featured location/brewery/private-event heroes stay image-only.
- Uploaded photo files are served through /api/website-photo-files/[target]/[filename]
- Featured/hidden photo selections live under the website photo root.
- If WEBSITE_PHOTOS_DIRECTORY is set, uploaded photos and feature selections use that directory.
- Otherwise, if BEER_OVERRIDES_DATA_FILE is set, website photos are stored next to that file in website-photos.
- Otherwise, local fallback is public/media.
- Amphitheater photo target slug: aviator-amphitheater
- Events page media target slug: events. This powers the public /events photo/video area and is uploaded from the manager Events section.

## Security
- Do not store plaintext passwords, Stripe secret keys, SMTP passwords, or private SSH credentials in this context file.
- Environment variable values for secrets should stay in Render or local .env files that are not committed.
