# G10 Shop Marketing Update

A password-protected dashboard of the marketing and PR plan for the Grade10 shop on Pak Sha Road, Causeway Bay (grand opening 6 Dec 2026, moved from 12 Dec): activation progress, Green Light decisions, KOL invitations and the campaign timeline.

Live page: https://ladywakaka.github.io/g10-shop-marketing-dashboard/

## Where the data lives

Notion page **Grade10 › G10 Shop Launch Tracker**, with four databases:

| Database | What the team changes |
|---|---|
| **Activations** | **Status** (Not started, Started, Pending, Finished, Dropped), **Open Items**, dates. The plan from the deck is in each row's page and shows as the ▶ details. |
| **KOL Invitations** | **Reply Status** (TBC, Waiting for reply, Accepted, Turned down) and **Note**. |
| | **Group** picks the section each person shows in: *SEA Creators*, *Global KOLs*, *HK KOLs* or *小紅書 KOLs / Pages* (this section shows even while it is empty). SEA creators are split by **9GAG Connection** (Connected to 9GAG, Not connected yet) and show their **Country** and **Instagram**. People whose activation is Dropped show crossed out. |
| **Green Light Decisions** | **Status** (Open, Confirmed) and **Needed By**. |
| **IG Outreach** | Shortlisted Instagram accounts posting about the launch from 6 Dec: **Outreach** (To contact, Contacted, In talks, Confirmed, Declined), **Assets** (Not started, In progress, Ready, Sent), **Post Date** and **Post Link**. |

- To cross out a name on an activation, write `Name: reason` in its **Crossed Out** field (one per line).
- Do not change the **Key** fields; they link rows to the page.
- The **Focus** folder (priorities and Lee Gardens Winter Fest dates) is written in `src/template.html`, not Notion. Edit it there.

No marketing data is stored in this repository. Only the encrypted page is published.

## Look and layout

`src/template.html` uses the same page code as the Claude version of this dashboard (claude.ai artifact TH4RWZoeYRkGwYZssL1Mm4), restyled at the bottom of the file in a "file folder" look: black and white, mostly white: white page and cards, light grey folders (#f1f1f0), two black folders (Green Lights, Timeline), one green (#2e7d4f) for progress (Started soft green, Finished / Accepted / Confirmed solid green), Newsreader and Archivo type. Status buttons open the item's row in Notion. When the Claude page's content or behaviour changes, copy the change here; keep the folder styles block at the end.

## How it updates

1. A GitHub Action (`.github/workflows/deploy.yml`) runs every day at 02:00 HKT, on every push to `main`, and whenever you click **Run workflow** (Actions tab).
2. `scripts/fetch_notion.py` pulls the four databases from Notion.
3. `scripts/build.py` puts the data into `src/template.html`.
4. [StatiCrypt](https://github.com/robinmoisson/staticrypt) encrypts the page with the team password, and the encrypted page is published to GitHub Pages.

## Secrets (Settings > Secrets and variables > Actions)

| Name | What it is |
|---|---|
| `NOTION_TOKEN` | Internal integration secret from notion.so/my-integrations. The G10 Shop Launch Tracker page must be connected to that integration (page menu > Connections). |
| `DASHBOARD_PASSWORD` | The password the team types to open the dashboard. Change it here, then run the workflow again. |
