"""Pull the G10 Shop Marketing Dashboard data from Notion into data/launch.json.

Reads four databases under Grade10 / G10 Shop Launch Tracker: Activations, KOL Invitations,
Green Light Decisions and IG Outreach. Each activation's page body (### headings and bullet points) becomes
its expandable plan on the dashboard.

Needs NOTION_TOKEN with access to the G10 Shop Launch Tracker page.
Uses only the Python standard library so the GitHub Action needs no installs.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ACTIVATIONS_DB = os.environ.get("LAUNCH_ACTIVATIONS_DB", "5b09a1ff7932403298c3ba900a810dc4")
KOLS_DB = os.environ.get("LAUNCH_KOLS_DB", "0b39c31466f6419d98a5042e3bde1399")
DECISIONS_DB = os.environ.get("LAUNCH_DECISIONS_DB", "64f50abec3f0440c9f42512e82555529")
IG_DB = os.environ.get("LAUNCH_IG_DB", "ccb74e7b08314c0f9f8d3a722b108669")
NOTION_VERSION = "2022-06-28"
OUT = Path(__file__).resolve().parent.parent / "data" / "launch.json"


def call(token, method, path, body=None):
    req = urllib.request.Request(
        "https://api.notion.com/v1/" + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        sys.exit(f"Notion API error {e.code} on {path}: {detail}\n"
                 "Check that the G10 Shop Launch Tracker page is shared with the integration "
                 "(page menu > Connections).")


def query(token, db):
    cursor = None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        page = call(token, "POST", f"databases/{db}/query", body)
        for row in page["results"]:
            if not (row.get("archived") or row.get("in_trash")):
                yield row
        if not page.get("has_more"):
            return
        cursor = page["next_cursor"]


def text(rich):
    return "".join(part.get("plain_text", "") for part in rich or [])


def plain(props, name):
    prop = props.get(name)
    if not prop:
        return None
    t = prop.get("type")
    v = prop.get(t)
    if v is None:
        return None
    if t in ("title", "rich_text"):
        return text(v) or None
    if t in ("select", "status"):
        return v.get("name")
    if t in ("number", "url", "email"):
        return v
    if t == "multi_select":
        return [o.get("name") for o in v]
    return None


def dates(props, name):
    v = (props.get(name) or {}).get("date") or {}
    start = (v.get("start") or "")[:10] or None
    end = (v.get("end") or "")[:10] or None
    return start, end or start


def details(token, page_id):
    """Turn a page body into {intro, sections:[{heading, items}]}.

    Text before the first heading is the intro; each heading starts a section; bullet points,
    numbered points and paragraphs under it are its items. The italic source line is skipped.
    """
    blocks, cursor = [], None
    while True:
        q = f"blocks/{page_id}/children?page_size=100" + (f"&start_cursor={cursor}" if cursor else "")
        page = call(token, "GET", q)
        blocks += page["results"]
        if not page.get("has_more"):
            break
        cursor = page["next_cursor"]
    return parse_blocks(blocks)


def parse_blocks(blocks):
    intro, sections = [], []
    for b in blocks:
        t = b.get("type")
        body = b.get(t) or {}
        words = text(body.get("rich_text")).strip()
        if not words:
            continue
        if t in ("heading_1", "heading_2", "heading_3"):
            sections.append({"heading": words, "items": []})
        elif t in ("bulleted_list_item", "numbered_list_item", "paragraph", "to_do", "quote", "callout"):
            if words.startswith("From the Retail Launch Deck"):
                continue
            if sections:
                sections[-1]["items"].append(words)
            else:
                intro.append(words)
    return {"intro": " ".join(intro), "sections": [s for s in sections if s["items"]]}


def struck(value):
    out = []
    for line in (value or "").splitlines():
        name, _, note = line.partition(":")
        if name.strip():
            out.append({"name": name.strip(), "note": note.strip()})
    return out


def main():
    token = (os.environ.get("NOTION_TOKEN") or "").strip()
    if not token:
        sys.exit("NOTION_TOKEN is not set. Add it under the repo's Settings > Secrets and variables > Actions.")

    activations = []
    for row in query(token, ACTIVATIONS_DB):
        p = row["properties"]
        name = plain(p, "Activation")
        if not name:
            continue
        start, end = dates(p, "Dates")
        d = details(token, row["id"])
        d["objective"] = plain(p, "Objective") or ""
        d["slides"] = plain(p, "Deck Slides") or ""
        activations.append({
            "id": plain(p, "Key") or row["id"],
            "initiative": name,
            "progress": plain(p, "Status") or "Not started",
            "phase": plain(p, "Phase") or "Pre-launch",
            "start": start,
            "end": end,
            "date_label": plain(p, "When") or "",
            "status": plain(p, "Deck Status") or "",
            "decision": plain(p, "Decision") or "",
            "open_items": plain(p, "Open Items") or "",
            "kind": plain(p, "Kind") or ("span" if start else "unscheduled"),
            "struck": struck(plain(p, "Crossed Out")),
            "details": d if (d["sections"] or d["intro"]) else None,
            "url": row.get("url"),
        })

    kols = []
    for row in query(token, KOLS_DB):
        p = row["properties"]
        name = plain(p, "Name")
        if not name:
            continue
        kols.append({
            "id": plain(p, "Key") or row["id"],
            "name": name,
            "status": plain(p, "Reply Status") or "TBC",
            "note": plain(p, "Note") or "",
            "profile": plain(p, "Profile") or "",
            "activation": plain(p, "For Activation") or "",
            "activation_id": plain(p, "Activation Key") or "",
            "timing": plain(p, "Timing") or "",
            "group": plain(p, "Group") or "",
            "country": plain(p, "Country") or "",
            "instagram": plain(p, "Instagram") or "",
            "connection": plain(p, "9GAG Connection") or "",
            "url": row.get("url"),
        })

    decisions = []
    for row in query(token, DECISIONS_DB):
        p = row["properties"]
        item = plain(p, "Item")
        if not item:
            continue
        needed, _ = dates(p, "Needed By")
        decisions.append({
            "id": plain(p, "Key") or row["id"],
            "n": plain(p, "No") or 99,
            "item": item,
            "status": plain(p, "Status") or "Open",
            "needed_by": needed,
            "confirm": plain(p, "To Confirm") or "",
            "unlocks": plain(p, "Unlocks") or "",
            "url": row.get("url"),
        })
    decisions.sort(key=lambda g: g["n"])

    ig = []
    for row in query(token, IG_DB):
        p = row["properties"]
        name = plain(p, "Account")
        if not name:
            continue
        post, _ = dates(p, "Post Date")
        ig.append({
            "id": plain(p, "Key") or row["id"],
            "name": name,
            "handle": plain(p, "Handle") or "",
            "instagram": plain(p, "Instagram") or "",
            "followers": plain(p, "Followers") or 0,
            "categories": plain(p, "Categories") or [],
            "location": plain(p, "Location") or "",
            "email": plain(p, "Email") or "",
            "outreach": plain(p, "Outreach") or "To contact",
            "assets": plain(p, "Assets") or "Not started",
            "post_date": post,
            "post_link": plain(p, "Post Link") or "",
            "note": plain(p, "Note") or "",
            "url": row.get("url"),
        })
    ig.sort(key=lambda a: -(a["followers"] or 0))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "activations": activations,
        "kols": kols,
        "decisions": decisions,
        "ig": ig,
    }, ensure_ascii=False, indent=1))
    print(f"Wrote {len(activations)} activations, {len(kols)} KOLs, {len(decisions)} decisions and {len(ig)} IG accounts to {OUT}")


if __name__ == "__main__":
    main()
