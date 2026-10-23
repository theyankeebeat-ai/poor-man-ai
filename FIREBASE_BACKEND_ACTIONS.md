# Firebase and backend action log

Date: 2026-10-22 (America/Montevideo).

## Scope and constraints

Added Firebase deployment files to this project, built and deployed Hosting, attempted Cloud Functions deployment, tested the production chat with follow-ups, fixed reproduced problems, and checked Render's backend rebuild. No Gemini API was used. Existing unrelated workspace edits were preserved. Credentials are not included in this log.

## Firebase configuration

- Confirmed Firebase CLI access to project `zerogravity-ab52d`.
- Confirmed `ai.usavisible.com` is an active custom domain on Hosting site `zerogravity-ab52d`.
- Added `.firebaserc` and `firebase.json` for this directory. Hosting publishes `dist`, preserves SPA routes, and sets asset caching and content-type protection headers.
- Added `functions/package.json`, its dependency lockfile, and `functions/index.cjs`. The `api` HTTP function proxies requests to Render, preserves request bodies and response streaming, forwards upstream status codes, and limits runtime and instance count.
- Added `firebase.functions.json` with the optional `/backend/**` Hosting rewrite for use after Cloud Functions can be deployed.
- Added `deploy:hosting` and `deploy:functions` npm scripts. Updated ignore rules for Firebase caches, debug logs, dependencies, and environment secrets.

## Cloud Functions deployment: blocked by billing

Command attempted:

```powershell
firebase deploy --only functions:poor-man-ai --project zerogravity-ab52d --non-interactive
```

Firebase rejected deployment because the project must be on the Blaze plan to enable the required Cloud Build and Artifact Registry APIs. No billing upgrade was performed. The function source passed `node --check`, but the function has **not** been deployed or tested in Firebase production.

The working production frontend uses the existing Supabase Edge Function proxy:

`https://wqrriztbsifgytjzippi.supabase.co/functions/v1/api`

It forwards requests to Render. The active `firebase.json` does not reference an undeployed Firebase function.

After the project owner enables Blaze, run `npm run deploy:functions`. To switch the frontend to the Firebase proxy as well, build with `VITE_API_URL=/backend` and deploy Hosting using `--config firebase.functions.json`. This optional switch was not applied to production.

Firebase documents this deployment requirement in its [Hosting and Cloud Functions guide](https://firebase.google.com/docs/hosting/functions).

## Frontend fixes and Hosting deployments

- Changed the default hosted API in `src/api.ts` and `src/backendApi.ts` to the existing Supabase proxy; retained localhost behavior for development and the `VITE_API_URL` override.
- Updated `.env.example` accordingly.
- Removed the startup message claiming an active 1B model and localhost connection without runtime verification.
- Changed connection errors to identify the configured API instead of always telling hosted users to start localhost.
- Added an error when a response stream closes without answer content, so a silent upstream failure does not leave an empty assistant response.
- Fixed completed messages retaining the `Streaming...` timestamp.
- Ran `npm run build` successfully after the changes and deployed Hosting with:

```powershell
firebase deploy --only hosting --project zerogravity-ab52d --non-interactive
```

Hosting deployment succeeded for `https://ai.usavisible.com` / `https://zerogravity-ab52d.web.app`.

## Follow-up repair and backend rebuild

- Fixed arithmetic follow-ups in `server/local_brain.py`: references such as “that result” now resolve against the immediately preceding, verified arithmetic answer.
- Added an explanation path for an arithmetic follow-up asking why the answer is correct.
- Unrelated messages, missing history, inconsistent prior arithmetic, and division by zero do not invent a result.
- Added `server/test_chat_followups.py` and verified it locally and against the production backend source checkout.
- Pushed the targeted backend repair as commit `7c2f6311beb55ed8f67b15d972f27320b5f7e3fd` in `theyankeebeat-ai/simple-ai`. Render rebuilt it and reported it live.
- A subsequent backend commit, `8602f0214fd039f3fafcb51698d72a81187bba6c`, bounds BERT activation memory by processing the retrieval shortlist in smaller batches. Its rollout is tracked below.
- Commit `9a3a321d515eeb31380418290b1741b4d03ca8d8` further limits inference to 128 tokens per input and a 16-passage shortlist, and adds backend error logging. These model-runtime changes are included in the final router deployment.
- Found a second cold-start defect: `/mcp/neurons` trained every routing network during module import and exceeded a 30-second request timeout. Changed initialization to train and cache each network on first use, while registry/status requests read the available bank names without training.
- Added `server/test_neurons_lazy.py` to verify registry inspection does not train networks and concurrent first use trains a bank exactly once, preserving the fallback to the reason bank.
- Pushed this targeted repair as commit `ceeaf5eceaae3a83aa1dd6bca5ec44d23a5be21f`. Render deployment `dep-dbdbajbm8hqs73e4l7cg` is live.

## Production browser test

Used headless Microsoft Edge through Playwright to visit `https://ai.usavisible.com/chat`, type questions, and click Send. The test records actual network requests and stored chat answers.

| Question | Observed answer | HTTP | Prior history turns |
| --- | --- | --- | --- |
| What is 12 times 8? | `12*8 = **96**.` | 200 | 0 |
| Now divide that result by 4. | `96/4 = **24**.` | 200 | 2 |
| Explain why the answer is correct. | `96/4 = **24** because 24 multiplied by 4 equals 96.` | 200 | 4 |

No page errors or Gemini network requests were observed in this browser test. This verifies this conversation chain, not every possible question or provider.

Artifacts:

- `scripts/check-hosted-chat.mjs`: reproducible browser check; requires Playwright and Edge. Set `PLAYWRIGHT_PATH` if Playwright is installed outside this project.
- `hosted-chat-results.json`: answers, HTTP statuses, history counts, and error observations.
- `hosted-chat-check.png`: production chat screenshot.

## Model and storage verification

- Render's model catalog returned eight restored snapshot files, including BERT weights, configuration, matching vocabulary, and all three WikiText split files.
- The inference implementation uses the training split for retrieval; validation and test splits are not added to the retrieval corpus.
- Ran `server/test_hf_runtime.py`, `server/test_chat_followups.py`, and `server/test_neurons_lazy.py`: **14 passed** in the final combined run. These include real checkpoint inference, vocabulary token IDs, deterministic retrieval, storage failover, checksum rejection, follow-up context, and lazy router initialization.
- An initial test invocation encountered a Windows permission problem in pytest's default shared temporary directory. Rerunning with a new dedicated temporary directory resolved the test setup issue; no permissions were changed.
- A live model request returned HTTP 503, and a subsequent attempt returned 502 around a server restart. These failures are not represented as successful inference.

## Final deployed service checks

After the last Render rebuild, the following routes were tested through the Supabase proxy used by the production frontend:

| Route | Result | Observed response time |
| --- | --- | --- |
| `/health` | HTTP 200 | 1.42 seconds |
| `/mcp/skills` | HTTP 200 | 0.52 seconds |
| `/mcp/neurons` | HTTP 200 | 0.52 seconds |
| `/tools` | HTTP 200 | 0.81 seconds |
| `/api/backends` | HTTP 200; Appwrite, Supabase, and Render each reported `ok: true` | 2.14 seconds |

An additional `/tts` request returned HTTP 200 and 17,136 bytes of `audio/mpeg`. This checks that synthesis returns audio; it is not a subjective listening test.

Service artifacts: `hosted-service-results.json` preserves the initial timeout and other checks; `hosted-final-backend-results.json` records the checks after the router fix and the final model request.

The first model request after the final rebuild exceeded the client's 90-second timeout. The health endpoint subsequently confirmed `loaded: true`, `weights_loaded: true`, provider `supabase`, **4,385,920 parameters**, and **16,930 training passages**. Cold-start latency remains a limitation of the current deployment.

The final warm model query through the production Supabase proxy succeeded: **HTTP 200 in 1.33 seconds**, returning two retrieved passages. Its response confirmed loaded BERT weights, the 30,522-token vocabulary, 4,385,920 parameters, and WikiText training-split retrieval. Returned input IDs began `[101, 1996, 2381, 1997, 1996, 3142, 3400, 102]`, confirming the query was encoded with the model tokenizer.

This is real encoder inference and retrieval. It does not constitute fine-tuning or turn BERT-tiny into a general chat generation model. The model is available to the assistant via `hf_search`; the arithmetic follow-up tests exercise the local arithmetic path rather than BERT generation.

## Remaining limitations

- Firebase Cloud Functions cannot be deployed until the project owner enables Blaze billing. Hosting and the existing Supabase proxy are deployed and working.
- A cold model startup exceeded 90 seconds on this host. Warm inference was verified successfully; cold-start latency has not been eliminated.
