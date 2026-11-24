# App Store Connect: the owner's steps for a first release with in-app purchases

What the agent prepares, and the numbered steps the account owner follows. Menu names are as seen in App Store Connect
as of 2026-11; if the owner's screen differs, ask for a screenshot and work from it.

## What only the account owner (or the Account Holder role) can do

| step | why it is theirs |
|---|---|
| Create the app record (My Apps › +) | The public API refused to create an app record; it is a web step. |
| Accept agreements under Business (Paid Apps, the updated license agreement) | An Admin could not accept the updated agreement; only the Account Holder could. |
| Answer the App Privacy form and publish it | It is not in the public API, and it is a legal statement by the owner. |
| Answer App Compliance forms, or change availability | Missing China mainland compliance forms (security assessment, AI-generated content) blocked adding the version to a submission. The owner chose to remove China mainland from availability instead of filling them. |
| Add each first in-app purchase for review, then submit | See below. |
| Reply in App Review / Resolution Center, resubmit | Review history belongs to the account. |
| Release an approved version on manual release | "Manually release this version" waits for a person. |

## What the agent prepares (files in the game, nothing written to the store)

- Description, subtitle, keywords, promotional text: from `store-prep`, passed through `check-text.mjs`.
- Review notes: how to reach the shop, which products it lists, that there is no login, what data the game sends — in
  words that match the App Privacy answers.
- The App Privacy answers, row by row (`privacy-forms.md`).
- The product table: store product id, type, reference name, display name, price — the products attached to the
  game's packages (`store-build` references/purchases.md).
- A one-page checklist of the steps below with the state of each.

## First release with in-app purchases, step by step

Give these to the owner one or two at a time and wait for the screenshot.

1. **Business.** Open App Store Connect › Business. Send a screenshot of the agreements list. Paid Apps must be
   Active; any banner asking to accept an updated agreement must be accepted by the Account Holder.
2. **App record.** My Apps › +. Platform iOS, the name, primary language, the bundle id the build uses, an SKU.
3. **App Information.** Category; age rating questionnaire (answer any new questions a banner asks for before
   submitting); privacy policy URL — a live page that names this game and what it sends.
4. **App Privacy.** Enter the rows from `privacy-forms.md`, then publish. Send a screenshot of the summary.
5. **In-app purchases.** For each product: the id from the product table, type, price, display name, description,
   review screenshot. Each one should reach "Ready to Submit".
6. **Version page.** Screenshots, description, keywords, support URL, review notes, the build (the one whose shop you
   tested), and the release option (manual or automatic after approval — the owner decides).
7. **Add the products for review.** Open each in-app purchase's own page and press **Add for Review**. The version page
   has no in-app purchase section; this is the only way.
8. **Submit.** Open the draft submission and check that it lists the version **and** every product, then submit.
   The dialog allows submitting the version alone; if that happens, remove the version from review and redo step 7.
9. **Wait.** One observed first release with purchases sat in Waiting for Review about three business days, was
   approved, and went live after the owner pressed release. Read status; do not cancel to "retry".

## After a rejection

- **2.1 Information Needed** came with questions and a request for a screen recording. Before recording, fix what the
  reviewer saw (in the observed case, a shop with no prices); a recording of the same broken shop only brings another round.
- **4.3(a) Spam**: do not reply that the game is original unless it is. Do not resubmit the same app unchanged; change
  what makes it look like the other app (first screenshots, concept on the page) first. Keeping other apps out of review
  meanwhile is advice from one incident (see Pacing in SKILL.md), not an Apple rule.
- The owner sends the reply and resubmits. The agent drafts the reply text with the build number filled in.
