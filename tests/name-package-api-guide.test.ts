import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NamePackageApiGuide from "../src/components/NamePackageApiGuide";

test("machine capability guide has localized boundaries and an inert bounded request example", () => {
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    const html = renderToStaticMarkup(React.createElement(NamePackageApiGuide, { language }));
    assert.match(html, /business_names_recommend/u);
    assert.match(html, /\/api\/v1\/public\/business-names/u);
    assert.match(html, /businessDescription/u);
    assert.match(html, /nameLanguage/u);
    assert.match(html, /70\/100/u);
    assert.match(html, /domains:search/u);
    assert.match(html, /<details/u);
    assert.match(html, /href="\/api\/openapi"/u);
    assert.match(html, /href="\/name-packages"/u);
    assert.doesNotMatch(html, /undefined|onclick=|<form|<script/u);
    if (language !== "en") assert.doesNotMatch(html, /Name packages for your agent/u);
  }
});
