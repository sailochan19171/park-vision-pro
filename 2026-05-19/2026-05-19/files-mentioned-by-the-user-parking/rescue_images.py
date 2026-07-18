"""One-shot rescue script — recovers UHF capture JPEGs that were lost when
Render's ephemeral disk got wiped between deploys.

Walks the on-site laptop's detections/ folder for uhf_*_full.jpg + uhf_*_plate.jpg
files, parses timestamp + RFID tag out of each filename, base64s the bytes,
and POSTs them to the cloud's /api/rescue_image endpoint. The server matches
each file to its UHFEntryEvent row by tag + timestamp and inserts the bytes
into the persistent image_blobs table.

Usage (from the on-site laptop):
    venv\\Scripts\\python.exe rescue_images.py

Reads CLOUD_PUSH_URL + CLOUD_PUSH_TOKEN from the same .env the agent uses.
Idempotent -- safe to run multiple times; re-uploads simply overwrite the
blob rows with the same bytes. Prints a running counter."""

import base64
import glob
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DETECTIONS_DIR = os.path.join(HERE, 'detections')
ENV_FILE = os.path.join(HERE, '.env')

# uhf_YYYYMMDD_HHMMSS_MMM_<TAG>_full.jpg  (or _plate.jpg)
NAME_RE = re.compile(
    r'^uhf_(\d{8})_(\d{6})_(\d{3})_([A-Za-z0-9]+)_(full|plate)\.jpg$',
    re.IGNORECASE)


def load_env():
    if not os.path.exists(ENV_FILE):
        sys.exit(f"[X] .env not found at {ENV_FILE}")
    env = {}
    for line in open(ENV_FILE, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip()
    for k in ('CLOUD_PUSH_URL', 'CLOUD_PUSH_TOKEN'):
        if not env.get(k):
            sys.exit(f"[X] .env is missing {k}")
    return env


def parse_filename(name):
    m = NAME_RE.match(name)
    if not m:
        return None
    yyyymmdd, hhmmss, millis, tag, kind = m.groups()
    try:
        ts = datetime.strptime(f"{yyyymmdd}{hhmmss}{millis}000",
                               "%Y%m%d%H%M%S%f")
    except ValueError:
        return None
    return {'tag': tag.upper(), 'ts': ts, 'kind': kind.lower()}


def post_one(url, token, filepath, meta):
    with open(filepath, 'rb') as f:
        raw = f.read()
    body = json.dumps({
        'rfid_tag':       meta['tag'],
        'capture_ts_iso': meta['ts'].isoformat(),
        'image_b64':      base64.b64encode(raw).decode('ascii'),
        'kind':           meta['kind'],
    }).encode('utf-8')
    req = urllib.request.Request(
        url.rstrip('/') + '/api/rescue_image',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {token}',
                 'Content-Type':  'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', errors='replace')
    except Exception as e:
        return 0, str(e)


def main():
    env = load_env()
    url   = env['CLOUD_PUSH_URL']
    token = env['CLOUD_PUSH_TOKEN']

    if not os.path.isdir(DETECTIONS_DIR):
        sys.exit(f"[X] detections folder not found: {DETECTIONS_DIR}")

    files = sorted(glob.glob(os.path.join(DETECTIONS_DIR, 'uhf_*.jpg')))
    if not files:
        print(f"[i] No uhf_*.jpg files found in {DETECTIONS_DIR}. Nothing to rescue.")
        return

    print(f"[i] Found {len(files)} local UHF capture(s). Uploading to {url}...")
    print(f"[i] This is IDEMPOTENT -- safe to run again. Ctrl-C to abort.\n")

    ok = skipped = failed = 0
    for i, path in enumerate(files, start=1):
        name = os.path.basename(path)
        meta = parse_filename(name)
        if not meta:
            print(f"  [{i:5}/{len(files)}] {name}  SKIP (unrecognised name)")
            skipped += 1
            continue

        status, body = post_one(url, token, path, meta)
        if status == 200:
            try:
                j = json.loads(body)
                print(f"  [{i:5}/{len(files)}] {name}  OK  -> "
                      f"row #{j.get('matched_id')} as '{j.get('filename')}'")
            except json.JSONDecodeError:
                print(f"  [{i:5}/{len(files)}] {name}  OK (non-JSON response)")
            ok += 1
        elif status == 404:
            print(f"  [{i:5}/{len(files)}] {name}  NO-MATCH (no cloud row for tag {meta['tag']})")
            skipped += 1
        else:
            print(f"  [{i:5}/{len(files)}] {name}  FAIL status={status} body={body[:120]}")
            failed += 1

        # Gentle pacing so we don't overwhelm the cloud or trip Render's rate limits.
        time.sleep(0.15)

    print(f"\n[✓] Done. Recovered: {ok}   Skipped: {skipped}   Failed: {failed}")
    if ok:
        print(f"[i] Open the cloud portal's UHF Captures panel -- old images should now display.")


if __name__ == '__main__':
    main()
