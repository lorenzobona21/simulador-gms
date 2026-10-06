import assert from "node:assert/strict";
import test from "node:test";

import { basicAuthCredentialsFromEnv, matchesBasicAuth } from "./basic-auth.ts";

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64");
const decode = (value: string) => Buffer.from(value, "base64").toString("utf8");

test("accepts both primary and secondary simulator logins", () => {
  const credentials = basicAuthCredentialsFromEnv({
    APP_LOGIN_USERNAME: "primary",
    APP_LOGIN_PASSWORD: "primary-password",
    APP_LOGIN_SECONDARY_USERNAME: "secondary",
    APP_LOGIN_SECONDARY_PASSWORD: "secondary-password"
  });

  assert.equal(matchesBasicAuth(`Basic ${encode("primary:primary-password")}`, credentials, decode), true);
  assert.equal(matchesBasicAuth(`Basic ${encode("secondary:secondary-password")}`, credentials, decode), true);
});

test("rejects incomplete, malformed, and incorrect credentials", () => {
  const credentials = basicAuthCredentialsFromEnv({
    APP_LOGIN_USERNAME: "primary",
    APP_LOGIN_PASSWORD: "primary-password",
    APP_LOGIN_SECONDARY_USERNAME: "secondary"
  });

  assert.deepEqual(credentials, [{ username: "primary", password: "primary-password" }]);
  assert.equal(matchesBasicAuth(null, credentials, decode), false);
  assert.equal(matchesBasicAuth(`Basic ${encode("missing-separator")}`, credentials, decode), false);
  assert.equal(matchesBasicAuth(`Basic ${encode("primary:wrong")}`, credentials, decode), false);
});
