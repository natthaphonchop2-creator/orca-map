import assert from "node:assert/strict";
import { test } from "node:test";
import { googleRedirectURI, googleSignInReason, googleStartHref, parseDomains } from "./google-signin.ts";

test("the redirect URI is the workspace's own callback", () => {
  assert.equal(googleRedirectURI("https://orca-workspace.onrender.com/"), "https://orca-workspace.onrender.com/oauth2/callback");
});

test("Google sign-in starts through the password provider and returns to rd", () => {
  const href = new URL(googleStartHref("https://orca.example", "/app?view=members&lang=th", { id: "local-auth-provider" }), "https://orca.example");
  assert.equal(href.pathname, "/oauth2/start");
  assert.equal(href.searchParams.get("rd"), "/app?view=members&lang=th");
  assert.equal(href.searchParams.get("obot-auth-provider"), "default/local-auth-provider");
  assert.equal(href.searchParams.get("via"), "google");
});

test("typed domains are split, lower-cased and deduplicated", () => {
  assert.deepEqual(parseDomains(" Example.co.th, @example.co.th\nbranch.example.co.th ;  "), ["example.co.th", "branch.example.co.th"]);
  assert.deepEqual(parseDomains(""), []);
});

test("only google_ errors are Google's, and unknown reasons read as a failure", () => {
  assert.equal(googleSignInReason("google_domain"), "domain");
  assert.equal(googleSignInReason("google_something-new"), "failed");
  assert.equal(googleSignInReason("1"), undefined);
  assert.equal(googleSignInReason(null), undefined);
});
