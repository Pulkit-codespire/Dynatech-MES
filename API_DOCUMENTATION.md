# OEE-MES API Documentation

**Base URL:** `http://localhost:3000` (development) or your deployed Vercel URL

**Authentication:** All endpoints (except `/api/health` and `/api/dashboard/*`) require the header:

```
Authorization: Bearer <DEVICE_API_KEY>
```

---

## Table of Contents

1. [Health Check](#1-health-check)
2. [Auth — Login](#2-auth--login)
3. [Events — Create](#3-events--create)
4. [Events — Batch Create](#4-events--batch-create)
5. [Events — List by Machine](#5-events--list-by-machine)
6. [Images — Upload](#6-images--upload)
7. [Images — List](#7-images--list)
8. [Operators — List](#8-operators--list)
9. [Parts — List](#9-parts--list)
10. [Machine Config — Get](#10-machine-config--get)
11. [Faces — Train](#11-faces--train)
12. [Faces — Recognize](#12-faces--recognize)
13. [Face — Recognize (with image save)](#13-face--recognize-with-image-save)
14. [Faces — Profiles List](#14-faces--profiles-list)
15. [Faces — Profile Delete](#15-faces--profile-delete)
16. [Faces — Map Unmapped Face](#16-faces--map-unmapped-face)
17. [Dashboard — Events](#17-dashboard--events)
18. [Dashboard — Images](#18-dashboard--images)
19. [Dashboard — Image Delete](#19-dashboard--image-delete)
20. [Dashboard — Machines (Event Delete)](#20-dashboard--machines-event-delete)
21. [Dashboard — Unmapped Faces List](#21-dashboard--unmapped-faces-list)
22. [Dashboard — Unmapped Face Delete](#22-dashboard--unmapped-face-delete)

---

## 1. Health Check

**`GET /api/health`** — No auth required

### Request

```bash
curl http://localhost:3000/api/health
```

### Response — 200 OK

```json
{
  "status": "ok",
  "code": 200,
  "db": "ok",
  "db_error": null,
  "latency_ms": 42,
  "timestamp": "2026-04-27T08:00:00.000Z"
}
```

### Response — 503 Degraded

```json
{
  "status": "degraded",
  "code": 503,
  "db": "error",
  "db_error": "connection refused",
  "latency_ms": 3012,
  "timestamp": "2026-04-27T08:00:00.000Z"
}
```

---

## 2. Auth — Login

**`POST /api/auth/login`**

### Request

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033" \
  -H "Content-Type: application/json" \
  -d '{
    "operator_id": "OP-RK-042",
    "pin": "0000",
    "machine_id": "JYOTI-01",
    "shift": "A"
  }'
```

### Request Body

| Field         | Type   | Required | Description                        |
| ------------- | ------ | -------- | ---------------------------------- |
| `operator_id` | string | Yes      | Operator ID (e.g. `"OP-RK-042"`)  |
| `pin`         | string | Yes      | Operator PIN (1-16 chars)          |
| `machine_id`  | string | Yes      | Machine ID (e.g. `"JYOTI-01"`)    |
| `shift`       | string | Yes      | Shift code (e.g. `"A"`, `"B"`)    |
| `ts`          | string | No       | Optional timestamp                 |

### Response — 200 OK

```json
{
  "status": "ok",
  "message": "Logged in",
  "operator": {
    "id": "OP-RK-042",
    "name": "Rakesh Kumar",
    "role": "operator"
  }
}
```

### Response — 401 Invalid PIN

```json
{
  "status": "error",
  "message": "invalid PIN"
}
```

### Response — 404 Operator Not Found

```json
{
  "status": "error",
  "message": "operator not found"
}
```

---

## 3. Events — Create

**`POST /api/events`**

### Request

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "machine_id": "JYOTI-01",
    "event_type": "cycle_complete",
    "timestamp": "2026-04-27T08:15:30.000Z",
    "payload": {
      "part_number": "DT-4521-A",
      "cycle_time_secs": 118,
      "operator_id": "OP-RK-042"
    }
  }'
```

### Request Body

| Field        | Type   | Required | Description                                     |
| ------------ | ------ | -------- | ----------------------------------------------- |
| `event_id`   | string | Yes      | UUID — idempotent key (duplicates are ignored)  |
| `machine_id` | string | Yes      | Machine identifier (max 64 chars)               |
| `event_type` | string | Yes      | Event type (max 64 chars)                       |
| `timestamp`  | string | Yes      | ISO 8601 datetime with timezone offset          |
| `payload`    | object | No       | Arbitrary JSON payload (defaults to `{}`)       |

### Response — 200 OK

```json
{
  "status": "ok",
  "event_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

---

## 4. Events — Batch Create

**`POST /api/events/batch`**

### Request

```bash
curl -X POST http://localhost:3000/api/events/batch \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "event_id": "11111111-1111-1111-1111-111111111111",
        "machine_id": "JYOTI-01",
        "event_type": "cycle_complete",
        "timestamp": "2026-04-27T08:10:00.000Z",
        "payload": { "cycle_time_secs": 115 }
      },
      {
        "event_id": "22222222-2222-2222-2222-222222222222",
        "machine_id": "JYOTI-01",
        "event_type": "cycle_complete",
        "timestamp": "2026-04-27T08:12:00.000Z",
        "payload": { "cycle_time_secs": 122 }
      }
    ]
  }'
```

### Request Body

| Field    | Type  | Required | Description                         |
| -------- | ----- | -------- | ----------------------------------- |
| `events` | array | Yes      | Array of event objects (1-500 max)  |

Each event in the array follows the same schema as [Events — Create](#3-events--create).

### Response — 200 OK

```json
{
  "status": "ok",
  "results": [
    { "event_id": "11111111-1111-1111-1111-111111111111", "status": "ok" },
    { "event_id": "22222222-2222-2222-2222-222222222222", "status": "ok" }
  ]
}
```

### Response — 200 OK (with duplicates)

```json
{
  "status": "ok",
  "results": [
    { "event_id": "11111111-1111-1111-1111-111111111111", "status": "duplicate" },
    { "event_id": "33333333-3333-3333-3333-333333333333", "status": "ok" }
  ]
}
```

---

## 5. Events — List by Machine

**`GET /api/events?machine_id={id}&limit={n}`**

### Request

```bash
curl "http://localhost:3000/api/events?machine_id=JYOTI-01&limit=10" \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033"
```

### Query Parameters

| Param        | Type   | Required | Default | Description                   |
| ------------ | ------ | -------- | ------- | ----------------------------- |
| `machine_id` | string | Yes      | —       | Filter by machine             |
| `limit`      | number | No       | 100     | Max results (capped at 1000)  |

### Response — 200 OK

```json
{
  "status": "ok",
  "count": 2,
  "events": [
    {
      "event_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "machine_id": "JYOTI-01",
      "event_type": "cycle_complete",
      "timestamp": "2026-04-27T08:15:30.000Z",
      "payload": { "cycle_time_secs": 118 },
      "received_at": "2026-04-27T08:15:30.500Z"
    },
    {
      "event_id": "11111111-1111-1111-1111-111111111111",
      "machine_id": "JYOTI-01",
      "event_type": "cycle_complete",
      "timestamp": "2026-04-27T08:10:00.000Z",
      "payload": { "cycle_time_secs": 115 },
      "received_at": "2026-04-27T08:10:00.300Z"
    }
  ]
}
```

---

## 6. Images — Upload

**`POST /api/images`** — multipart/form-data

### Request

```bash
curl -X POST http://localhost:3000/api/images \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033" \
  -F "image=@/path/to/photo.jpg" \
  -F "machine_id=JYOTI-01" \
  -F "caption=Cycle snapshot"
```

### Form Fields

| Field        | Type   | Required | Description                                              |
| ------------ | ------ | -------- | -------------------------------------------------------- |
| `image`      | file   | Yes      | Image file (jpeg, png, webp, gif). Max 8 MB              |
| `machine_id` | string | Yes      | Machine identifier                                       |
| `caption`    | string | No       | Optional caption                                         |

### Response — 200 OK

```json
{
  "status": "ok",
  "image": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "machine_id": "JYOTI-01",
    "storage_path": "JYOTI-01/1714204530000-abc123.jpeg",
    "public_url": "https://gzgqbmwuyivjwqyirtux.supabase.co/storage/v1/object/public/machine-images/JYOTI-01/1714204530000-abc123.jpeg",
    "content_type": "image/jpeg",
    "size_bytes": 245760,
    "caption": "Cycle snapshot",
    "uploaded_at": "2026-04-27T08:15:30.000Z"
  }
}
```

### Response — 413 File Too Large

```json
{
  "status": "error",
  "message": "image exceeds max size 8388608 bytes"
}
```

### Response — 415 Unsupported Type

```json
{
  "status": "error",
  "message": "unsupported content-type: image/bmp"
}
```

---

## 7. Images — List

**`GET /api/images?machine_id={id}&limit={n}`**

### Request

```bash
curl "http://localhost:3000/api/images?machine_id=JYOTI-01&limit=10" \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033"
```

### Query Parameters

| Param        | Type   | Required | Default | Description                  |
| ------------ | ------ | -------- | ------- | ---------------------------- |
| `machine_id` | string | No       | —       | Filter by machine            |
| `limit`      | number | No       | 50      | Max results (capped at 200)  |

### Response — 200 OK

```json
{
  "status": "ok",
  "images": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "machine_id": "JYOTI-01",
      "public_url": "https://example.supabase.co/storage/v1/object/public/machine-images/JYOTI-01/photo.jpeg",
      "content_type": "image/jpeg",
      "size_bytes": 245760,
      "caption": "Cycle snapshot",
      "uploaded_at": "2026-04-27T08:15:30.000Z"
    }
  ]
}
```

---

## 8. Operators — List

**`GET /api/operators`**

### Request

```bash
curl http://localhost:3000/api/operators \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033"
```

### Response — 200 OK

```json
{
  "status": "ok",
  "operators": [
    { "id": "OP-RK-042", "name": "Rakesh Kumar", "role": "operator" },
    { "id": "OP-SY-018", "name": "Suresh Yadav", "role": "operator" },
    { "id": "ST-AP-007", "name": "Amit Patil", "role": "setter" },
    { "id": "SV-MD-001", "name": "Mahesh Desai", "role": "supervisor" }
  ]
}
```

---

## 9. Parts — List

**`GET /api/parts?machine_id={id}`**

### Request

```bash
curl "http://localhost:3000/api/parts?machine_id=JYOTI-01" \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033"
```

### Query Parameters

| Param        | Type   | Required | Default | Description                          |
| ------------ | ------ | -------- | ------- | ------------------------------------ |
| `machine_id` | string | No       | —       | Filter parts assigned to a machine   |

### Response — 200 OK

```json
{
  "status": "ok",
  "parts": [
    {
      "part_number": "DT-4521-A",
      "description": "Steel bracket",
      "setup": "S3",
      "target_secs": 120,
      "machine_id": "JYOTI-01"
    },
    {
      "part_number": "DT-6102-B",
      "description": "Al housing",
      "setup": "S1",
      "target_secs": 195,
      "machine_id": "JYOTI-01"
    },
    {
      "part_number": "DT-7703-C",
      "description": "MS flange",
      "setup": "S2",
      "target_secs": 105,
      "machine_id": "JYOTI-01"
    }
  ]
}
```

---

## 10. Machine Config — Get

**`GET /api/machine/config?machine_id={id}`**

### Request

```bash
curl "http://localhost:3000/api/machine/config?machine_id=JYOTI-01" \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033"
```

### Query Parameters

| Param        | Type   | Required | Description   |
| ------------ | ------ | -------- | ------------- |
| `machine_id` | string | Yes      | Machine ID    |

### Response — 200 OK

```json
{
  "status": "ok",
  "machine_id": "JYOTI-01",
  "name": "Jyoti #1",
  "shifts": {
    "A": "06:00-14:00",
    "B": "14:00-22:00"
  },
  "lunch": "12:00-12:30"
}
```

### Response — 404 Not Found

```json
{
  "status": "error",
  "message": "machine not found"
}
```

---

## 11. Faces — Train

**`POST /api/faces/train`** — multipart/form-data, no API key required

### Request

```bash
curl -X POST http://localhost:3000/api/faces/train \
  -F "image=@/path/to/rakesh.jpg" \
  -F "name=Rakesh Kumar" \
  -F "label=rakesh-kumar" \
  -F "employee_id=OP-RK-042" \
  -F "notes=Training photo from shopfloor"
```

### Form Fields

| Field         | Type   | Required | Description                                                |
| ------------- | ------ | -------- | ---------------------------------------------------------- |
| `image`       | file   | Yes      | Face photo (must contain exactly one detectable face)       |
| `name`        | string | Yes      | Display name (1-64 chars)                                  |
| `label`       | string | Yes      | Unique label, lowercase alphanumeric/hyphens (1-32 chars)  |
| `employee_id` | string | No       | Employee/operator ID (1-32 chars)                          |
| `notes`       | string | No       | Optional notes (max 255 chars)                             |

### Response — 200 OK

```json
{
  "status": "ok",
  "profile_id": "c3d4e5f6-a1b2-7890-cdef-1234567890ab",
  "label": "rakesh-kumar",
  "embedding_id": "d4e5f6a1-b2c3-8901-defg-234567890abc"
}
```

### Response — 422 No Face Detected

```json
{
  "status": "error",
  "message": "no face detected in image"
}
```

---

## 12. Faces — Recognize

**`POST /api/faces/recognize`** — multipart/form-data

### Request

```bash
curl -X POST http://localhost:3000/api/faces/recognize \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033" \
  -F "image=@/path/to/photo.jpg" \
  -F "machine_id=JYOTI-01" \
  -F "threshold=0.6"
```

### Form Fields

| Field        | Type   | Required | Default | Description                         |
| ------------ | ------ | -------- | ------- | ----------------------------------- |
| `image`      | file   | Yes      | —       | Photo containing a face             |
| `machine_id` | string | No       | unknown | Machine context                     |
| `threshold`  | number | No       | 0.6     | Match threshold (0.1 - 0.99)       |

### Response — 200 Match Found

```json
{
  "status": "ok",
  "recognized": true,
  "label": "rakesh-kumar",
  "name": "Rakesh Kumar",
  "confidence": 0.847
}
```

### Response — 200 No Match

```json
{
  "status": "ok",
  "recognized": false,
  "confidence": 0,
  "unmapped_face_id": "e5f6a1b2-c3d4-9012-efgh-34567890abcd"
}
```

### Response — 200 No Face Detected

```json
{
  "status": "ok",
  "recognized": false,
  "reason": "no_face_detected"
}
```

---

## 13. Face — Recognize (with image save)

**`POST /api/face/recognize`** — multipart/form-data

This is the **device-facing endpoint** that always saves the uploaded image to storage (for the dashboard) and then runs face recognition.

### Request

```bash
curl -X POST http://localhost:3000/api/face/recognize \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033" \
  -F "image=@/path/to/photo.jpg" \
  -F "machine_id=JYOTI-01" \
  -F "threshold=0.6"
```

### Form Fields

| Field        | Type   | Required | Default | Description                        |
| ------------ | ------ | -------- | ------- | ---------------------------------- |
| `image`      | file   | Yes      | —       | Photo containing a face            |
| `machine_id` | string | No       | unknown | Machine context                    |
| `threshold`  | number | No       | 0.6     | Match threshold (0.1 - 0.99)      |

### Response — 200 Match Found

```json
{
  "recognized": true,
  "name": "Rakesh Kumar",
  "employee_id": "OP-RK-042",
  "confidence": 0.85,
  "image_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

### Response — 200 No Match

```json
{
  "recognized": false,
  "unmapped_face_id": "e5f6a1b2-c3d4-9012-efgh-34567890abcd",
  "image_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

### Response — 200 No Face Detected

```json
{
  "recognized": false,
  "reason": "no_face_detected",
  "image_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

---

## 14. Faces — Profiles List

**`GET /api/faces/profiles`** — No auth required

### Request

```bash
curl http://localhost:3000/api/faces/profiles
```

### Response — 200 OK

```json
{
  "status": "ok",
  "profiles": [
    {
      "id": "c3d4e5f6-a1b2-7890-cdef-1234567890ab",
      "name": "Rakesh Kumar",
      "label": "rakesh-kumar",
      "employee_id": "OP-RK-042",
      "notes": "Training photo from shopfloor",
      "created_at": "2026-04-25T10:00:00.000Z",
      "updated_at": "2026-04-27T08:00:00.000Z",
      "embedding_count": 3
    },
    {
      "id": "d4e5f6a1-b2c3-8901-defg-234567890abc",
      "name": "Suresh Yadav",
      "label": "suresh-yadav",
      "employee_id": "OP-SY-018",
      "notes": null,
      "created_at": "2026-04-25T10:05:00.000Z",
      "updated_at": "2026-04-25T10:05:00.000Z",
      "embedding_count": 1
    }
  ]
}
```

---

## 15. Faces — Profile Delete

**`DELETE /api/faces/profiles?id={profile_id}`** — No auth required

### Request

```bash
curl -X DELETE "http://localhost:3000/api/faces/profiles?id=c3d4e5f6-a1b2-7890-cdef-1234567890ab"
```

### Query Parameters

| Param | Type   | Required | Description              |
| ----- | ------ | -------- | ------------------------ |
| `id`  | string | Yes      | Profile UUID to delete   |

### Response — 200 OK

```json
{
  "status": "ok"
}
```

> Note: This cascade-deletes all associated `face_embeddings`.

---

## 16. Faces — Map Unmapped Face

**`POST /api/faces/map`** — No auth required

Maps an unmapped face embedding to a new or existing face profile.

### Request

```bash
curl -X POST http://localhost:3000/api/faces/map \
  -H "Content-Type: application/json" \
  -d '{
    "embedding_id": "e5f6a1b2-c3d4-9012-efgh-34567890abcd",
    "name": "Amit Patil",
    "label": "amit-patil",
    "employee_id": "ST-AP-007",
    "notes": "Mapped from dashboard"
  }'
```

### Request Body

| Field          | Type   | Required | Description                                                |
| -------------- | ------ | -------- | ---------------------------------------------------------- |
| `embedding_id` | string | Yes      | UUID of the unmapped embedding                             |
| `name`         | string | Yes      | Display name (1-64 chars)                                  |
| `label`        | string | Yes      | Unique label, lowercase alphanumeric/hyphens (1-32 chars)  |
| `employee_id`  | string | No       | Employee/operator ID                                       |
| `notes`        | string | No       | Optional notes (max 255 chars)                             |

### Response — 200 OK

```json
{
  "status": "ok",
  "profile_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "label": "amit-patil",
  "embedding_id": "e5f6a1b2-c3d4-9012-efgh-34567890abcd"
}
```

### Response — 404 Embedding Not Found

```json
{
  "status": "error",
  "message": "embedding not found"
}
```

### Response — 409 Already Mapped

```json
{
  "status": "error",
  "message": "embedding already mapped"
}
```

---

## 17. Dashboard — Events

**`GET /api/dashboard/events?limit={n}&since={iso}`** — No auth required

### Request

```bash
curl "http://localhost:3000/api/dashboard/events?limit=50&since=2026-04-27T08:00:00.000Z"
```

### Query Parameters

| Param   | Type   | Required | Default | Description                                   |
| ------- | ------ | -------- | ------- | --------------------------------------------- |
| `limit` | number | No       | 100     | Max results (capped at 500)                   |
| `since` | string | No       | —       | Only events received after this ISO timestamp  |

### Response — 200 OK

```json
{
  "status": "ok",
  "server_time": "2026-04-27T08:20:00.000Z",
  "stats": {
    "total_events": 1250,
    "events_last_minute": 8,
    "unique_machines_in_window": 1
  },
  "machines": [
    {
      "machine_id": "JYOTI-01",
      "last_event_at": "2026-04-27T08:19:58.000Z",
      "last_event_type": "cycle_complete",
      "count_last_min": 8
    }
  ],
  "events": [
    {
      "event_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "machine_id": "JYOTI-01",
      "event_type": "cycle_complete",
      "timestamp": "2026-04-27T08:19:58.000Z",
      "payload": { "cycle_time_secs": 118 },
      "received_at": "2026-04-27T08:19:58.500Z"
    }
  ]
}
```

---

## 18. Dashboard — Images

**`GET /api/dashboard/images?machine_id={id}&limit={n}`** — No auth required

### Request

```bash
curl "http://localhost:3000/api/dashboard/images?machine_id=JYOTI-01&limit=12"
```

### Query Parameters

| Param        | Type   | Required | Default | Description                  |
| ------------ | ------ | -------- | ------- | ---------------------------- |
| `machine_id` | string | No       | —       | Filter by machine            |
| `limit`      | number | No       | 24      | Max results (capped at 100)  |

### Response — 200 OK

```json
{
  "status": "ok",
  "server_time": "2026-04-27T08:20:00.000Z",
  "images": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "machine_id": "JYOTI-01",
      "public_url": "https://example.supabase.co/storage/v1/object/public/machine-images/JYOTI-01/photo.jpeg",
      "content_type": "image/jpeg",
      "size_bytes": 245760,
      "caption": "Cycle snapshot",
      "uploaded_at": "2026-04-27T08:15:30.000Z",
      "recognized_name": "Rakesh Kumar",
      "recognition_confidence": 0.847
    },
    {
      "id": "a2b3c4d5-e6f7-8901-bcde-f23456789012",
      "machine_id": "JYOTI-01",
      "public_url": "https://example.supabase.co/storage/v1/object/public/machine-images/JYOTI-01/photo2.jpeg",
      "content_type": "image/jpeg",
      "size_bytes": 198000,
      "caption": null,
      "uploaded_at": "2026-04-27T08:10:00.000Z",
      "recognized_name": null,
      "recognition_confidence": null
    }
  ]
}
```

---

## 19. Dashboard — Image Delete

**`DELETE /api/dashboard/images?id={image_id}`** — No auth required

### Request

```bash
curl -X DELETE "http://localhost:3000/api/dashboard/images?id=f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

### Query Parameters

| Param | Type   | Required | Description            |
| ----- | ------ | -------- | ---------------------- |
| `id`  | string | Yes      | Image UUID to delete   |

### Response — 200 OK

```json
{
  "status": "ok"
}
```

### Response — 404 Not Found

```json
{
  "status": "error",
  "message": "not found"
}
```

---

## 20. Dashboard — Machines (Event Delete)

**`DELETE /api/dashboard/machines?machine_id={id}`** — No auth required

Deletes all events for a given machine.

### Request

```bash
curl -X DELETE "http://localhost:3000/api/dashboard/machines?machine_id=JYOTI-01"
```

### Query Parameters

| Param        | Type   | Required | Description                              |
| ------------ | ------ | -------- | ---------------------------------------- |
| `machine_id` | string | Yes      | Machine ID whose events will be deleted  |

### Response — 200 OK

```json
{
  "status": "ok",
  "machine_id": "JYOTI-01",
  "deleted": 42
}
```

---

## 21. Dashboard — Unmapped Faces List

**`GET /api/dashboard/unmapped-faces?limit={n}`** — No auth required

### Request

```bash
curl "http://localhost:3000/api/dashboard/unmapped-faces?limit=20"
```

### Query Parameters

| Param   | Type   | Required | Default | Description                  |
| ------- | ------ | -------- | ------- | ---------------------------- |
| `limit` | number | No       | 50      | Max results (capped at 200)  |

### Response — 200 OK

```json
{
  "status": "ok",
  "unmapped_faces": [
    {
      "embedding_id": "e5f6a1b2-c3d4-9012-efgh-34567890abcd",
      "source_image_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "image_url": "https://example.supabase.co/storage/v1/object/public/machine-images/JYOTI-01/photo.jpeg",
      "machine_id": "JYOTI-01",
      "created_at": "2026-04-27T08:15:30.000Z"
    }
  ]
}
```

---

## 22. Dashboard — Unmapped Face Delete

**`DELETE /api/dashboard/unmapped-faces?id={embedding_id}`** — No auth required

Deletes an unmapped face embedding. Only works if the embedding has no profile assigned.

### Request

```bash
curl -X DELETE "http://localhost:3000/api/dashboard/unmapped-faces?id=e5f6a1b2-c3d4-9012-efgh-34567890abcd"
```

### Query Parameters

| Param | Type   | Required | Description                     |
| ----- | ------ | -------- | ------------------------------- |
| `id`  | string | Yes      | Embedding UUID to delete        |

### Response — 200 OK

```json
{
  "status": "ok"
}
```

---

## Error Responses (Common)

All error responses follow this format:

### 401 Unauthorized

```json
{
  "status": "error",
  "message": "missing or invalid Authorization header"
}
```

### 400 Validation Failed

```json
{
  "status": "error",
  "message": "validation failed",
  "issues": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "String must contain at least 1 character(s)",
      "path": ["machine_id"]
    }
  ]
}
```

### 500 Internal Server Error

```json
{
  "status": "error",
  "message": "db insert failed"
}
```
