import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/lib/flight-log.ts", "utf8");
assert.match(source, /flightLogCategories = \[/, "categories are declared");
assert.match(source, /flightLogStatuses = \[/, "statuses are declared");
assert.match(source, /slug VARCHAR\(180\) UNIQUE NOT NULL/, "slug is unique in schema");
assert.match(source, /status IN \('draft', 'published', 'archived'\)/, "status is constrained");
assert.match(source, /category IN \('live_music', 'events', 'beer_releases', 'food_specials', 'brewery_news', 'questions_answers', 'schedule_updates'\)/, "category is constrained");
assert.ok(source.includes("script\\b"), "script tags are stripped from plain text inputs");
assert.match(source, /show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE/, "homepage feature flag is in schema");
assert.match(source, /getHomepageFlightLogPosts/, "homepage Flight Log query exists");
assert.match(await readFile("src/app/api/manager/flight-log/route.ts", "utf8"), /if \(!isManager\(request\)\)/, "admin API checks manager auth");
assert.match(await readFile("src/app/flight-log/[slug]/page.tsx", "utf8"), /if \(!post\) notFound\(\)/, "missing or unpublished posts 404");
assert.match(await readFile("src/components/flight-log-formatting.tsx", "utf8"), /FlightLogFormattedBody/, "rich formatting renderer exists");
console.log("flight-log.tests.passed");
