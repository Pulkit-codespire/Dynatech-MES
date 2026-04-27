# Face Recognition System

## Overview

The face recognition system allows operators to be identified by their face. It uses ONNX-based ML models (SCRFD for detection, MobileFaceNet for 512-dimensional embeddings) and pgvector for cosine similarity matching.

## Complete Workflow

```
DEVICE (Machine)                         SERVER                              DASHBOARD (Browser)
─────────────────                        ──────                              ───────────────────

1. Supervisor selects operator
   on device screen

2. Device captures 5-6 photos
   from different angles

3. Device sends each image ───────► POST /api/faces/train-bulk
   (one request per image,            (stores image, NO training)
    5-6 calls total)                  Image saved as "pending"
                                                                    4. /face-management page shows
                                                                       pending uploads grouped
                                                                       by operator with thumbnails

                                                                    5. Supervisor clicks "Train"
                                                                       ──────────────────────────►
                                   POST /api/faces/train-stored  ◄──
                                   (downloads images from storage,
                                    runs face detection + embedding
                                    extraction, creates profile)

                                   Profile created with embeddings
                                   from all successful images
                                                                    6. Profile appears in
                                                                       "Trained Profiles" list

─── Later, during production ───

7. Device captures operator
   photo for identification

8. Device sends image ───────────► POST /api/faces/recognize
                                   (detects face, extracts embedding,
                                    matches against stored profiles
                                    using cosine similarity)

9. Device receives response ◄────── { recognized: true,
                                      name: "Rakesh Kumar",
                                      confidence: 0.87 }

   If NOT recognized:
                                   Saves as "unmapped face"
                                                                   10. Unmapped face appears on
                                                                       dashboard with operator
                                                                       dropdown to map it
```

---

## API Reference

### Authentication

Device endpoints require API key:
```
Authorization: Bearer <DEVICE_API_KEY>
```

Dashboard endpoints (under `/api/dashboard/*` and `/api/faces/profiles`, `/api/faces/train-stored`, `/api/faces/map`) do NOT require authentication.

---

### Step 1: Upload Face Images (Device → Server)

**`POST /api/faces/train-bulk`** — Requires API key

Stores a single face image for an operator. The device calls this **once per image** (5-6 times total for different angles). No ML processing happens here — images are stored as "pending" until trained from the dashboard.

**Request** (JSON):
```json
{
  "operator_id": "OP-RK-042",
  "image": "/9j/4AAQSkZJRgABAQ...",
  "content_type": "image/jpeg"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `operator_id` | string | Yes | Operator ID from the operators table |
| `image` | string | Yes | Base64-encoded image binary |
| `content_type` | string | No | MIME type (default: `image/jpeg`) |

**curl example (one image):**
```bash
# Encode image to base64 and send
IMAGE_B64=$(base64 -w0 photo1.jpg)

curl -X POST http://localhost:3000/api/faces/train-bulk \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033" \
  -H "Content-Type: application/json" \
  -d "{
    \"operator_id\": \"OP-RK-042\",
    \"image\": \"$IMAGE_B64\",
    \"content_type\": \"image/jpeg\"
  }"
```

**Response (200):**
```json
{
  "status": "ok",
  "operator_id": "OP-RK-042",
  "operator_name": "Rakesh Kumar",
  "image_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Error responses:**
- `401` — Missing or invalid API key
- `400` — Missing `operator_id`, missing/invalid `image` base64, or validation failed
- `404` — Operator not found or inactive
- `500` — Storage upload or DB insert failed

**Device flow (pseudocode):**
```
for each captured_photo in [photo1, photo2, photo3, photo4, photo5]:
    base64_data = encode_base64(captured_photo)
    POST /api/faces/train-bulk
      body: { operator_id: "OP-RK-042", image: base64_data }
    // image is now stored as pending
```

---

### Step 2: View Pending Uploads (Dashboard)

**`GET /api/dashboard/pending-training`** — No auth

Returns uploaded images that haven't been trained yet, grouped by operator.

**curl example:**
```bash
curl http://localhost:3000/api/dashboard/pending-training
```

**Response (200):**
```json
{
  "status": "ok",
  "pending": [
    {
      "operator_id": "OP-RK-042",
      "operator_name": "Rakesh Kumar",
      "images": [
        {
          "id": "a1b2c3d4-...",
          "machine_id": "face-pending:OP-RK-042",
          "public_url": "https://xxx.supabase.co/storage/v1/object/public/machine-images/face-pending/OP-RK-042/1714200000-uuid.jpg",
          "content_type": "image/jpeg",
          "size_bytes": 45230,
          "caption": "Pending: Rakesh Kumar",
          "uploaded_at": "2026-04-27T10:00:00Z"
        },
        {
          "id": "e5f6g7h8-...",
          "machine_id": "face-pending:OP-RK-042",
          "public_url": "https://xxx.supabase.co/storage/v1/object/public/machine-images/face-pending/OP-RK-042/1714200001-uuid.jpg",
          "content_type": "image/jpeg",
          "size_bytes": 52100,
          "caption": "Pending: Rakesh Kumar",
          "uploaded_at": "2026-04-27T10:00:01Z"
        }
      ]
    },
    {
      "operator_id": "OP-SY-018",
      "operator_name": "Suresh Yadav",
      "images": [
        { "..." : "..." }
      ]
    }
  ]
}
```

---

### Step 3: Train Face (Dashboard → Server)

**`POST /api/faces/train-stored`** — No auth

Triggers ML training from previously uploaded pending images. Downloads each image from Supabase storage, runs SCRFD face detection + MobileFaceNet embedding extraction, creates/updates the face profile.

**Request:**
```json
{
  "operator_id": "OP-RK-042"
}
```

**curl example:**
```bash
curl -X POST http://localhost:3000/api/faces/train-stored \
  -H "Content-Type: application/json" \
  -d '{"operator_id": "OP-RK-042"}'
```

**Response (200):**
```json
{
  "status": "ok",
  "profile_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "label": "op-rk-042",
  "operator_name": "Rakesh Kumar",
  "results": [
    { "image_id": "a1b2c3d4-...", "status": "ok", "embedding_id": "x1y2z3-..." },
    { "image_id": "e5f6g7h8-...", "status": "ok", "embedding_id": "a4b5c6-..." },
    { "image_id": "i9j0k1l2-...", "status": "failed", "reason": "no face detected" },
    { "image_id": "m3n4o5p6-...", "status": "ok", "embedding_id": "d7e8f9-..." }
  ],
  "processed": 3,
  "failed": 1,
  "embedding_ids": ["x1y2z3-...", "a4b5c6-...", "d7e8f9-..."]
}
```

**What happens internally:**
1. Looks up operator from `operators` table
2. Fetches all images with `machine_id = 'face-pending:OP-RK-042'`
3. Downloads each image from Supabase storage
4. Runs SCRFD face detection (640x640, multi-scale)
5. Aligns face using Umeyama transform (112x112)
6. Extracts 512-D embedding via MobileFaceNet
7. Upserts `face_profiles` row (name, label, employee_id)
8. Inserts `face_embeddings` row per successful image
9. Moves images from `face-pending:` to `face-training:` status

**Error responses:**
- `400` — Missing `operator_id`
- `404` — Operator not found or no pending images

---

### Step 4: Recognize a Face (Device → Server)

**`POST /api/faces/recognize`** — Requires API key

Detects face in image, extracts embedding, matches against all trained profiles using pgvector cosine similarity.

**Request** (multipart/form-data):
```
Content-Type: multipart/form-data
Authorization: Bearer af70e413...

Fields:
  image: <photo.jpg>
  machine_id: "JYOTI-01"
  threshold: 0.6          (optional, default 0.6, range 0.1-0.99)
```

**curl example:**
```bash
curl -X POST http://localhost:3000/api/faces/recognize \
  -H "Authorization: Bearer af70e413197b585ef38f2bea0a74faf667a47073058df4eb24220adfec061033" \
  -F "image=@operator_photo.jpg" \
  -F "machine_id=JYOTI-01" \
  -F "threshold=0.6"
```

**Response — Face recognized (200):**
```json
{
  "status": "ok",
  "recognized": true,
  "label": "op-rk-042",
  "name": "Rakesh Kumar",
  "confidence": 0.872
}
```

**Response — Face NOT recognized (200):**
```json
{
  "status": "ok",
  "recognized": false,
  "confidence": 0,
  "unmapped_face_id": "abc123-def456-..."
}
```
The unrecognized face is automatically saved as an "unmapped face" for later mapping from the dashboard.

**Response — No face detected in image (200):**
```json
{
  "status": "ok",
  "recognized": false,
  "reason": "no_face_detected"
}
```

---

## Dashboard APIs

### List Operators (for dropdown)

**`GET /api/dashboard/operators`** — No auth

```bash
curl http://localhost:3000/api/dashboard/operators
```

**Response (200):**
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

### List Trained Profiles

**`GET /api/faces/profiles`** — No auth

```bash
curl http://localhost:3000/api/faces/profiles
```

**Response (200):**
```json
{
  "status": "ok",
  "profiles": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "name": "Rakesh Kumar",
      "label": "op-rk-042",
      "employee_id": "OP-RK-042",
      "notes": null,
      "created_at": "2026-04-27T10:05:00Z",
      "updated_at": "2026-04-27T10:05:00Z",
      "embedding_count": 5
    }
  ]
}
```

---

### Delete a Profile

**`DELETE /api/faces/profiles?id=<profile_id>`** — No auth

Deletes the profile and all its embeddings (cascade).

```bash
curl -X DELETE "http://localhost:3000/api/faces/profiles?id=f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

**Response (200):**
```json
{ "status": "ok" }
```

---

### List Unmapped Faces

**`GET /api/dashboard/unmapped-faces?limit=50`** — No auth

Returns faces detected by `/api/faces/recognize` that didn't match any profile.

```bash
curl "http://localhost:3000/api/dashboard/unmapped-faces?limit=50"
```

**Response (200):**
```json
{
  "status": "ok",
  "unmapped_faces": [
    {
      "embedding_id": "abc123-def456-...",
      "source_image_id": "img-789-...",
      "image_url": "https://xxx.supabase.co/storage/v1/object/public/machine-images/unmapped-faces/JYOTI-01/1714200000-uuid.jpg",
      "machine_id": "JYOTI-01",
      "created_at": "2026-04-27T11:30:00Z"
    }
  ]
}
```

---

### Map an Unmapped Face to an Operator

**`POST /api/faces/map`** — No auth

Links an unmapped face embedding to a face profile (creates profile if it doesn't exist).

**Request:**
```json
{
  "embedding_id": "abc123-def456-...",
  "name": "Rakesh Kumar",
  "label": "op-rk-042",
  "employee_id": "OP-RK-042"
}
```

**curl example:**
```bash
curl -X POST http://localhost:3000/api/faces/map \
  -H "Content-Type: application/json" \
  -d '{
    "embedding_id": "abc123-def456-...",
    "name": "Rakesh Kumar",
    "label": "op-rk-042",
    "employee_id": "OP-RK-042"
  }'
```

**Response (200):**
```json
{
  "status": "ok",
  "profile_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "label": "op-rk-042",
  "embedding_id": "abc123-def456-..."
}
```

**Error responses:**
- `404` — Embedding not found
- `409` — Embedding already mapped to a profile

---

### Dismiss an Unmapped Face

**`DELETE /api/dashboard/unmapped-faces?id=<embedding_id>`** — No auth

Deletes the unmapped embedding (only works if unmapped).

```bash
curl -X DELETE "http://localhost:3000/api/dashboard/unmapped-faces?id=abc123-def456-..."
```

**Response (200):**
```json
{ "status": "ok" }
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `face_profiles` | One row per person (name, label, employee_id) |
| `face_embeddings` | 512-D vectors, multiple per profile. `profile_id = NULL` means unmapped |
| `face_recognition_log` | Every recognition attempt with confidence and outcome |
| `machine_images` | Image storage metadata. `machine_id` prefix indicates status |

### Image Status Convention

The `machine_id` field in `machine_images` uses prefixes to track image lifecycle:

| Prefix | Meaning |
|--------|---------|
| `face-pending:{operator_id}` | Uploaded by device, waiting for training |
| `face-training:{label}` | Trained (embeddings extracted) |
| `unmapped-face:{machine_id}` | Unrecognized face from recognition |

---

## ML Pipeline

```
Input Image (JPEG/PNG)
        │
        ▼
┌─────────────────────┐
│  SCRFD 500M (ONNX)  │  Face detection + 5 keypoints
│  Input: 640x640     │  (eyes, nose, mouth corners)
│  Score threshold: 0.25│
└─────────┬───────────┘
          │ Detected face + keypoints
          ▼
┌─────────────────────┐
│  Umeyama Transform  │  Align face to standard template
│  Output: 112x112    │
└─────────┬───────────┘
          │ Aligned face
          ▼
┌─────────────────────┐
│ MobileFaceNet (ONNX)│  Extract 512-D embedding
│ w600k weights       │  L2-normalized
└─────────┬───────────┘
          │ Float32Array[512]
          ▼
┌─────────────────────┐
│   pgvector (HNSW)   │  Cosine similarity search
│   match_face() RPC  │  against stored embeddings
└─────────────────────┘
```

## Dashboard Page

The face management page is at `/face-management` and has three sections:

1. **Pending Training** — Shows device-uploaded images grouped by operator. Each group has a "Train" button.
2. **Trained Profiles** — Lists all face profiles with embedding counts. Profiles can be deleted.
3. **Unmapped Faces** — Shows unrecognized faces with an operator dropdown to map them or a dismiss button.
