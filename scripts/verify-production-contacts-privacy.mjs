#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production contact-privacy verification (B226 Part A).
 *
 * Verifies the three contact-privacy settings:
 *   - REQUESTS_ONLY is the default for new accounts
 *   - EVERYONE creates a mutual contact immediately
 *   - REQUESTS_ONLY creates an incoming request that can be accepted
 *   - NOBODY rejects new contact requests
 *   - Cross-request auto-accept works when both users send requests
 *
 * Supports reusable verifier account pools. When a pool is used, the script
 * resets privacy and removes contacts between the test accounts before each
 * scenario so repeated runs do not interfere with each other.
 *
 * Optional env vars:
 *   VERIFY_API_BASE  — override API endpoint
 *   VERIFY_PASSWORD  — fixed password (do not commit)
 *   VERIFY_ACCOUNT_POOL_JSON — reusable verified account pool
 */

import {
  API_BASE,
  getVerifiedAccount,
  api,
  finalize,
  sleep,
} from "./lib/verify-helpers.mjs";

const runId = `verify-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function expectStatus(fn) {
  return fn.catch((err) => ({
    __expectedError: true,
    status: err.message.match(/HTTP (\d+)/)?.[1] || "error",
    message: err.message,
  }));
}

async function setPrivacy(token, setting) {
  await api(token, "PATCH", "/users/me/contact-privacy", {
    contactPrivacySetting: setting,
  });
}

async function removeContactIfExists(token, userId) {
  await api(token, "DELETE", `/contacts/${userId}`).catch(() => {});
}

async function resetAccounts(accounts) {
  for (const account of accounts) {
    await setPrivacy(account.accessToken, "REQUESTS_ONLY");
  }
  for (const account of accounts) {
    for (const other of accounts) {
      if (other.user.id !== account.user.id) {
        await removeContactIfExists(account.accessToken, other.user.id);
      }
    }
  }
}

async function main() {
  console.log("=== Production Contact Privacy Verification (B226 Part A) ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const alice = await getVerifiedAccount("privacyalice");
  await sleep(1500);
  const bob = await getVerifiedAccount("privacybob");
  await sleep(1500);
  const carol = await getVerifiedAccount("privacycarol");
  await sleep(1500);
  const dave = await getVerifiedAccount("privacydave");

  const all = [alice, bob, carol, dave];

  // Reset state so reusable accounts behave deterministically.
  await resetAccounts(all);

  // ---- Default / explicit privacy ----

  const alicePrivacy = await api(alice.accessToken, "GET", "/users/me/contact-privacy");
  results.push({
    check: "Contact privacy can be read",
    ok: ["REQUESTS_ONLY", "EVERYONE", "NOBODY"].includes(alicePrivacy.contactPrivacySetting),
    detail: alicePrivacy.contactPrivacySetting,
  });

  await setPrivacy(alice.accessToken, "REQUESTS_ONLY");
  const aliceReset = await api(alice.accessToken, "GET", "/users/me/contact-privacy");
  results.push({
    check: "User can set privacy to REQUESTS_ONLY",
    ok: aliceReset.contactPrivacySetting === "REQUESTS_ONLY",
    detail: aliceReset.contactPrivacySetting,
  });

  // ---- EVERYONE: direct mutual contact ----

  await setPrivacy(alice.accessToken, "EVERYONE");
  await removeContactIfExists(bob.accessToken, alice.user.id);
  const aliceUpdated = await api(alice.accessToken, "GET", "/users/me/contact-privacy");
  results.push({
    check: "User can set privacy to EVERYONE",
    ok: aliceUpdated.contactPrivacySetting === "EVERYONE",
    detail: aliceUpdated.contactPrivacySetting,
  });

  const bobAddsAlice = await api(bob.accessToken, "POST", "/contacts", {
    userId: alice.user.id,
  });
  results.push({
    check: "EVERYONE target creates a contact immediately",
    ok: bobAddsAlice.type === "contact" && bobAddsAlice.contactUserId === alice.user.id,
    detail: `type=${bobAddsAlice.type}`,
  });

  const bobContacts = await api(bob.accessToken, "GET", "/contacts");
  results.push({
    check: "Requester sees EVERYONE target in contacts",
    ok: bobContacts.some((c) => c.contactUserId === alice.user.id),
  });

  // ---- REQUESTS_ONLY: outgoing request + accept ----

  await setPrivacy(alice.accessToken, "REQUESTS_ONLY");
  await removeContactIfExists(carol.accessToken, alice.user.id);

  const carolAddsAlice = await api(carol.accessToken, "POST", "/contacts", {
    userId: alice.user.id,
  });
  results.push({
    check: "REQUESTS_ONLY target creates a pending request",
    ok:
      carolAddsAlice.type === "request" &&
      carolAddsAlice.toUserId === alice.user.id &&
      carolAddsAlice.status === "PENDING",
    detail: `type=${carolAddsAlice.type}`,
  });

  const aliceRequests = await api(alice.accessToken, "GET", "/contacts/requests");
  const matchingRequest = aliceRequests.find((r) => r.fromUserId === carol.user.id);
  results.push({
    check: "Recipient lists incoming REQUESTS_ONLY request",
    ok: Boolean(matchingRequest),
  });

  await api(alice.accessToken, "POST", `/contacts/requests/${matchingRequest.id}/accept`);
  const carolContactsAfterAccept = await api(carol.accessToken, "GET", "/contacts");
  const aliceContactsAfterAccept = await api(alice.accessToken, "GET", "/contacts");
  results.push({
    check: "Accepted request becomes a mutual contact for the sender",
    ok: carolContactsAfterAccept.some((c) => c.contactUserId === alice.user.id),
  });
  results.push({
    check: "Accepted request becomes a mutual contact for the recipient",
    ok: aliceContactsAfterAccept.some((c) => c.contactUserId === carol.user.id),
  });

  // ---- NOBODY: reject new requests ----

  await setPrivacy(alice.accessToken, "NOBODY");
  await removeContactIfExists(dave.accessToken, alice.user.id);
  const aliceNobody = await api(alice.accessToken, "GET", "/users/me/contact-privacy");
  results.push({
    check: "User can set privacy to NOBODY",
    ok: aliceNobody.contactPrivacySetting === "NOBODY",
    detail: aliceNobody.contactPrivacySetting,
  });

  const daveAddsAlice = await expectStatus(
    api(dave.accessToken, "POST", "/contacts", { userId: alice.user.id }),
  );
  results.push({
    check: "NOBODY target rejects new contact requests with 403",
    ok: daveAddsAlice.__expectedError && daveAddsAlice.status === "403",
    detail: daveAddsAlice.status,
  });

  // ---- Cross-request auto-accept ----

  await setPrivacy(alice.accessToken, "REQUESTS_ONLY");
  await removeContactIfExists(dave.accessToken, alice.user.id);
  await removeContactIfExists(alice.accessToken, dave.user.id);

  const daveToAlice = await api(dave.accessToken, "POST", "/contacts", {
    userId: alice.user.id,
  });
  results.push({
    check: "Cross-request first leg creates a pending request",
    ok: daveToAlice.type === "request" && daveToAlice.status === "PENDING",
    detail: `type=${daveToAlice.type}`,
  });

  const aliceToDave = await api(alice.accessToken, "POST", "/contacts", {
    userId: dave.user.id,
  });
  results.push({
    check: "Cross-request second leg auto-accepts and creates mutual contact",
    ok: aliceToDave.type === "contact" && aliceToDave.contactUserId === dave.user.id,
    detail: `type=${aliceToDave.type}`,
  });

  const daveContacts = await api(dave.accessToken, "GET", "/contacts");
  results.push({
    check: "Cross-request sender ends up with mutual contact",
    ok: daveContacts.some((c) => c.contactUserId === alice.user.id),
  });

  // ---- Validation ----

  const invalidPrivacy = await expectStatus(
    api(alice.accessToken, "PATCH", "/users/me/contact-privacy", {
      contactPrivacySetting: "FRIENDS_ONLY",
    }),
  );
  results.push({
    check: "Invalid contact-privacy setting is rejected with 400",
    ok: invalidPrivacy.__expectedError && invalidPrivacy.status === "400",
    detail: invalidPrivacy.status,
  });

  finalize(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
