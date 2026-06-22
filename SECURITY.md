# Security & Remediation — Ordkollen

GitHub flagged a publicly leaked Firebase Web API key for project `uhjk-9998d`.

## Important context first

This is a **Firebase Web API key**. Unlike a typical server secret, a Firebase Web key is **meant to be public** — it ships inside the browser of every visitor and only *identifies* your project. It does **not** grant access by itself. You **cannot** hide it in a static client-side app like this one.

➡️ Hiding/encrypting the key is NOT the real fix. The real protection is the steps below. Rotating it still clears the GitHub alert and is good hygiene.

## Step 1 — Rotate the key
Google Cloud Console → APIs & Services → Credentials → Regenerate (or create a new Browser key and delete the old one). Paste the new value into your local `firebase-config.js`.

## Step 2 — Restrict the API key (THE key protection)
Set **Application restrictions → HTTP referrers** to only your domains (e.g. your prod domain, GitHub Pages URL, and `http://localhost:*/*`). Under **API restrictions**, limit it to Identity Toolkit (Firebase Auth) and Cloud Firestore. Now the key is useless from any other site.

## Step 3 — Lock down Firestore Security Rules (protects user data)
Firebase Console → Firestore Database → Rules → paste the contents of `firestore.rules` → Publish. This is what actually stops one user from reading/altering another user's data.

## Step 4 — Enable Firebase App Check
Firebase Console → App Check → register the web app with reCAPTCHA to block requests not coming from your real app.

## Step 5 — Keep config out of the repo going forward
`firebase-config.js` is now gitignored. Commit `firebase-config.example.js` and create the real file locally / at deploy time.

## Step 6 — Remove the old key from git history
The key still lives in past commits. Purge it:
```bash
pip install git-filter-repo
git filter-repo --path firebase-config.js --invert-paths
git push origin --force --all
```
Or use BFG Repo-Cleaner. After force-pushing, close the GitHub alert.

## Summary checklist
- [ ] Rotate the API key
- [ ] Add HTTP-referrer + API restrictions
- [ ] Publish firestore.rules
- [ ] Enable App Check
- [ ] Confirm firebase-config.js is gitignored
- [ ] Purge the key from git history & force-push
- [ ] Close the GitHub secret-scanning alert
