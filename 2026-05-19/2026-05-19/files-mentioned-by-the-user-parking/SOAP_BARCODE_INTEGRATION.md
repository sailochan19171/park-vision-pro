# VayAccess — SOAP Barcode Ingest Integration Guide

Push whitelist / blacklist barcodes into the VayAccess parking system by
sending SOAP-over-HTTP requests to two endpoints. Each request is an
**UPSERT** — matched by `<UtId>`, so re-sending the same UtId updates the
existing row instead of creating a duplicate.

Applies to both the cloud (`https://vayaccess-cloud.onrender.com`) and any
on-site laptop (`http://<lan-ip>:5002`). Same request body, same auth.

---

## Endpoints

| Purpose | URL |
|---|---|
| Add / update a **whitelist** row (allowed at the gate) | `POST /api/soap/whitelist` |
| Add / update a **blacklist** row (banned at the gate)  | `POST /api/soap/blacklist` |

**Content-Type:** `text/xml; charset=utf-8`
**Auth:** `Authorization: Bearer <CLOUD_PUSH_TOKEN>` — request the token from
the VayAccess admin. Same token used by the other cloud-push endpoints.

---

## Request body — SOAP envelope

Both endpoints accept the same wrapper element (`<UpsertBarcode>`). The
XML parser matches on **local names only** so custom namespaces are fine.

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <UpsertBarcode xmlns="https://vayaccess.com/soap">
      <UtId>UT-000123</UtId>
      <Barcode>123456789012</Barcode>
      <UhfTagId>E2801191A503006BD7574447</UhfTagId>
      <NumberPlate>TS09AB1234</NumberPlate>
      <OwnerName>John Doe</OwnerName>
      <Department>Engineering</Department>
      <ContactNumber>9876543210</ContactNumber>
      <VehicleType>Car</VehicleType>
      <ValidUntil>2027-12-31</ValidUntil>
      <Properties>{"employee_id":"E-4421","site":"HYD-01"}</Properties>
    </UpsertBarcode>
  </soap:Body>
</soap:Envelope>
```

### Field reference

| Element | Required | Type / Format | Notes |
|---|---|---|---|
| `<UtId>` | **Yes** | string ≤ 80 chars | Upstream system's primary key. Used to upsert. Must be unique per row. |
| `<Barcode>` | Optional | string ≤ 100 | The **printed 1D/2D barcode** on the pass (Code-128, QR, etc.). Scanned by a handheld barcode reader. **Different field** from `<UhfTagId>`. |
| `<UhfTagId>` (or legacy `<RfidTag>`) | Optional | string ≤ 100 hex | The **UHF RFID chip's EPC** (24-char hex like `E2801191A503006BD7574447`). Read by the UHF antenna at the gate. |
| `<NumberPlate>` | Yes (whitelist) | string ≤ 50 | For blacklist, at least one of NumberPlate / Barcode / UhfTagId is required. |
| `<OwnerName>` | Yes (whitelist) | string ≤ 100 | Person the pass belongs to. |
| `<Department>` | No | string ≤ 100 | Defaults to `External` on whitelist creates so the row appears in the admin UI. |
| `<ContactNumber>` | No | string ≤ 20 | |
| `<VehicleType>` | No | Car / Truck / Bike / Scooty | Defaults to `Car`. |
| `<ValidUntil>` | No (whitelist) | ISO-8601 date `YYYY-MM-DD` | Whitelist only. Defaults to +1 year if omitted. |
| `<Reason>` | No | string ≤ 255 | Blacklist only — reason for the ban. |
| `<Properties>` | No | any string (JSON recommended) | Free-form. Stored verbatim in the DB. |

### Barcode vs UhfTagId — the important distinction

A single pass can carry TWO different tokens for two different scanner types:

- **`<Barcode>`** — the visible printed code on the pass (Code-128, QR code, etc.). Scanned by a **handheld barcode scanner** or the visitor's phone camera. Short range, requires line of sight.
- **`<UhfTagId>`** — the invisible RFID chip embedded in the plastic. Read by the **UHF antenna at the gate**. Long range (up to 10m), no line of sight required, hands-free.

Send **both** if your pass has both. Send just one if it only has one physical token. Gate access matches on whichever the scanner reports.

---

## Response — success

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <UpsertBarcodeResponse xmlns="https://vayaccess.com/soap">
      <Status>OK</Status>
      <Action>created</Action>          <!-- or "updated" -->
      <Id>42</Id>                        <!-- internal DB row id -->
      <UtId>UT-000123</UtId>
    </UpsertBarcodeResponse>
  </soap:Body>
</soap:Envelope>
```

HTTP status: `200 OK`.

## Response — error

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>UtId is required</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>
```

HTTP status codes:

| Status | Meaning |
|---|---|
| `400 Client Fault` | Bad XML, missing required field, malformed date |
| `401 Client Fault` | Missing / wrong Bearer token |
| `500 Server Fault` | DB write failure — safe to retry with exponential backoff |

---

## Example — curl (whitelist)

```bash
curl -X POST https://vayaccess-cloud.onrender.com/api/soap/whitelist \
  -H "Authorization: Bearer $CLOUD_PUSH_TOKEN" \
  -H 'Content-Type: text/xml; charset=utf-8' \
  --data-binary @- <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <UpsertBarcode>
      <UtId>UT-000123</UtId>
      <Barcode>123456789012</Barcode>
      <UhfTagId>E2801191A503006BD7574447</UhfTagId>
      <NumberPlate>TS09AB1234</NumberPlate>
      <OwnerName>John Doe</OwnerName>
      <Department>Engineering</Department>
      <ContactNumber>9876543210</ContactNumber>
      <VehicleType>Car</VehicleType>
      <ValidUntil>2027-12-31</ValidUntil>
      <Properties>{"employee_id":"E-4421"}</Properties>
    </UpsertBarcode>
  </soap:Body>
</soap:Envelope>
XML
```

## Example — Python (blacklist)

```python
import requests

xml = """<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <UpsertBarcode>
      <UtId>UT-BAN-77</UtId>
      <UhfTagId>E2801191A503006BD7574447</UhfTagId>
      <Barcode>123456789012</Barcode>
      <Reason>Terminated employee - retain-tag policy</Reason>
      <Properties>{"terminated_on":"2026-07-10"}</Properties>
    </UpsertBarcode>
  </soap:Body>
</soap:Envelope>"""

r = requests.post(
    "https://vayaccess-cloud.onrender.com/api/soap/blacklist",
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type":  "text/xml; charset=utf-8",
    },
    data=xml.encode("utf-8"),
    timeout=10,
)
print(r.status_code, r.text)
```

---

## Underlying database tables

For reference only — do **not** INSERT directly into these tables. Always go
through the SOAP endpoints so validation, audit logging, and cache
invalidation run correctly.

### `whitelist`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | auto |
| `ut_id` | VARCHAR(80) UNIQUE | upstream system's key |
| `barcode` | VARCHAR(100) UNIQUE | 1D/2D printed barcode ← from `<Barcode>` |
| `rfid_tag` | VARCHAR(100) UNIQUE | UHF EPC (24-char hex) ← from `<UhfTagId>` |
| `number_plate` | VARCHAR(50) NOT NULL | |
| `owner_name` | VARCHAR(100) NOT NULL | |
| `department` | VARCHAR(100) | |
| `contact_number` | VARCHAR(20) | |
| `vehicle_type` | VARCHAR(50) default 'Car' | |
| `valid_until` | TIMESTAMP NOT NULL | |
| `properties` | TEXT | JSON string |
| `created_at` | TIMESTAMP default now | |

### `blacklist`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | auto |
| `ut_id` | VARCHAR(80) UNIQUE | upstream system's key |
| `barcode` | VARCHAR(100) INDEX | 1D/2D printed barcode ← from `<Barcode>` |
| `rfid_tag` | VARCHAR(100) INDEX | UHF EPC ← from `<UhfTagId>` |
| `number_plate` | VARCHAR(50) INDEX | at least one of plate/barcode/uhf required |
| `reason` | VARCHAR(255) | why the ban |
| `properties` | TEXT | JSON string |
| `added_by` | VARCHAR(50) | set to `soap-ingest` by this endpoint |
| `created_at` | TIMESTAMP default now | |

---

## Behaviour at the gate

- When a UHF reader scans a tag, the on-site agent looks up the tag in
  `whitelist` first. If found and `valid_until > now`, access is **granted**.
- The tag is also checked against `blacklist` (by rfid_tag OR number_plate).
  If found, access is **denied** regardless of whitelist state.
- Deletes on either table via SOAP are not yet supported; to revoke a pass,
  push an updated whitelist row with `<ValidUntil>` set to a past date.
