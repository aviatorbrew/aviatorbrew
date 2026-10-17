# Repository Context

This repository is the Aviator Brewing Company website.

## Default Project

- Primary app root: this directory, usually checked out at `/home/skynet/aviatorbrew/aviatorbrew-new`
- Stack: Next.js 15, React 19, TypeScript, and Tailwind CSS
- GitHub repository: `aviatorbrew/aviatorbrew`
- Git remote URL: `https://github.com/aviatorbrew/aviatorbrew.git`
- Main branch: `main`
- Purpose: public Aviator Brewing Company website with manager/admin features for menus, beers, events, coupons, tours, kegs, shop content, and related operations

## Default Action

When starting future work, treat this as the Aviator Brew website repo. Inspect this app first for website changes.

After completing requested changes, run the relevant validation, commit the ready changes, and push to GitHub repository `aviatorbrew/aviatorbrew` on `main` unless the user explicitly asks for local-only work or the change is not ready to publish.

Only commit files related to the requested work. Do not include unrelated local changes such as generated logs.

## Event Flight Plan Versions

Increment the Event Flight Plan's simple version number for every published change to its content, menu, pricing, layout, or calculations (for example, v.1.1 → v.1.2 → v.1.3). Set the number in `src/lib/ready-room-flight-plan.ts`, regenerate the PDF, and keep its page footers, metadata, website download label, and download URL in sync. Use this simple numbering instead of date-based versions.

## Google Calendar Sync

Sync Event-ReadyRoom at 8 a.m., noon, and 3 p.m. Eastern daily. Never overwrite data already entered in saved manager event plans. Add new bookings and record Google changes, cancellations, and deletions in separate sync metadata for review; retain the saved plans and payment records. Keep the private iCal URL in Render environment variables only.
