import assert from "node:assert/strict";
import test from "node:test";
import { unavailableFeatureView } from "../src/i18n/unavailableFeatureCopy";

test("unavailable account routes explain the gap and never invent a ranking", () => {
  const history = unavailableFeatureView("en", "/history");
  assert.equal(history.title, "Search history is not kept");
  assert.equal(history.actionHref, "/watchlist");
  assert.equal(history.secondaryHref, "/");

  const domains = unavailableFeatureView("en", "/my-domains");
  assert.match(domains.body, /not available in this version/);
  assert.equal(domains.actionHref, "/watchlist");
  assert.doesNotMatch(domains.body, /\$\d|estimated value of/u);

  const ranking = unavailableFeatureView("en", "/top-10-today");
  assert.match(ranking.body, /unverified claim/);
  assert.equal(ranking.actionHref, "/");
  assert.equal(ranking.secondaryHref, "/watchlist");
  assert.doesNotMatch(ranking.body, /\$\d|SEK|USD|rank 1/u);

  const swedish = unavailableFeatureView("sv", "/history");
  assert.equal(swedish.title, "Sökhistorik sparas inte");
  assert.equal(swedish.actionHref, "/watchlist");
  assert.equal(unavailableFeatureView("zh", "/unknown").actionHref, "/");
});
