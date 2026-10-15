# G10 Shop Marketing Update

A password-protected dashboard of the marketing and PR plan for the Grade10 shop on Pak Sha Road, Causeway Bay (trial run 6 Dec, grand opening 12 Dec 2026): activation progress, Green Light decisions, KOL invitations and the campaign timeline.

Live page: https://ladywakaka.github.io/g10-shop-marketing-dashboard/

## Where the data lives

Notion page **Grade10 › G10 Shop Launch Tracker**, with three databases:

| Database | What the team changes |
|---|---|
| **Activations** | **Status** (Not started, Started, Pending, Finished, Dropped), **Open Items**, dates. The plan from the deck is in each row's page and shows as the ▶ details. |
| **KOL Invitations** | **Reply Status** (TBC, Waiting for reply, Accepted, Turned down) and **Note**. |
| | SEA creators: set **Group** to *SEA Creators* to show a person in the SEA section, grouped by **9GAG Connection** (Connected to 9GAG, Not connected yet), with **Country** and **Instagram**. |
| **Green Light Decisions** | **Status** (Open, Confirmed) and **Needed By**. |

- To cross out a name on an activation, write `Name: reason` in its **Crossed Out** field (one per line).
- Do not change the **Key** fields; they link rows to the page.
- The **Focus** folder (priorities and Lee Gardens Winter Fest dates) is written in `src/template.html`, not Notion. Edit it there.

No marketing data is stored in this repository. Only the encrypted page is published.

## Look and layout

`src/template.html` uses the same page code as the Claude version of this dashboard (claude.ai artifact TH4RWZoeYRkGwYZssL1Mm4), restyled at the bottom of the file in a "file folder" look: black and white, mostly white: white page and cards, light grey folders (#f1f1f0), two black folders (Green Lights, Timeline), one green (#2e7d4f) for progress (Started soft green, Finished / Accepted / Confirmed solid green), Newsreader and Archivo type. Status buttons open the item's row in Notion. When the Claude page's content or behaviour changes, copy the change here; keep the folder styles block at the end.

## How it updates

1. A GitHub Action (`.github/workflows/deploy.yml`) runs every day at 02:00 HKT, on every push to `main`, and whenever you click **Run workflow** (Actions tab).
2. `scripts/fetch_notion.py` pulls the three databases from Notion.
3. `scripts/build.py` puts the data into `src/template.html`.
4. [StatiCrypt](https://github.com/robinmoisson/staticrypt) encrypts the page with the team password, and the encrypted page is published to GitHub Pages.

## Secrets (Settings > Secrets and variables > Actions)

| Name | What it is |
|---|---|
| `NOTION_TOKEN` | Internal integration secret from notion.so/my-integrations. The G10 Shop Launch Tracker page must be connected to that integration (page menu > Connections). |
| `DASHBOARD_PASSWORD` | The password the team types to open the dashboard. Change it here, then run the workflow again. |
