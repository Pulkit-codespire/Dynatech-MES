"use client";

import { useEffect, useState } from "react";

type Operator = {
  id: string;
  name: string;
  role: string;
};

type FaceProfile = {
  id: string;
  name: string;
  label: string;
  employee_id: string | null;
  notes: string | null;
  created_at: string;
  embedding_count: number;
};

type UnmappedFace = {
  embedding_id: string;
  source_image_id: string | null;
  image_url: string | null;
  machine_id: string | null;
  created_at: string;
};

type PendingImage = {
  id: string;
  machine_id: string;
  public_url: string;
  content_type: string | null;
  size_bytes: number | null;
  caption: string | null;
  uploaded_at: string;
};

type PendingGroup = {
  operator_id: string;
  operator_name: string;
  images: PendingImage[];
};

type TrainResult = {
  image_id: string;
  status: "ok" | "failed";
  reason?: string;
};

function fmtAgo(iso: string, now: number): string {
  const d = now - new Date(iso).getTime();
  if (d < 0) return "just now";
  if (d < 1000) return "just now";
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

export default function FaceManagement() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [profiles, setProfiles] = useState<FaceProfile[]>([]);
  const [unmappedFaces, setUnmappedFaces] = useState<UnmappedFace[]>([]);
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState<string | null>(null);

  // Training state (per operator)
  const [trainingOperatorId, setTrainingOperatorId] = useState<string | null>(null);
  const [trainResults, setTrainResults] = useState<TrainResult[] | null>(null);
  const [trainError, setTrainError] = useState<string | null>(null);

  // Profile management
  const [deletingProfile, setDeletingProfile] = useState<string | null>(null);

  // Unmapped face mapping
  const [mappingId, setMappingId] = useState<string | null>(null);
  const [mapOperatorId, setMapOperatorId] = useState("");
  const [mapLoading, setMapLoading] = useState(false);
  const [mapStatus, setMapStatus] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tickOperators() {
      try {
        const r = await fetch("/api/dashboard/operators", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (j.status === "ok") setOperators(j.operators);
      } catch {
        // silent
      }
    }

    async function tickProfiles() {
      try {
        const r = await fetch("/api/faces/profiles", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (j.status === "ok") setProfiles(j.profiles);
      } catch {
        // silent
      }
    }

    async function tickUnmapped() {
      try {
        const r = await fetch("/api/dashboard/unmapped-faces?limit=50", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (j.status === "ok") setUnmappedFaces(j.unmapped_faces);
      } catch {
        // silent
      }
    }

    async function tickPending() {
      try {
        const r = await fetch("/api/dashboard/pending-training", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (j.status === "ok") setPendingGroups(j.pending);
      } catch {
        // silent
      }
    }

    tickOperators();
    tickProfiles();
    tickUnmapped();
    tickPending();

    const opId = setInterval(tickOperators, 30_000);
    const profId = setInterval(tickProfiles, 10_000);
    const unmapId = setInterval(tickUnmapped, 10_000);
    const pendId = setInterval(tickPending, 10_000);
    const clockId = setInterval(() => setNow(Date.now()), 1_000);

    return () => {
      cancelled = true;
      clearInterval(opId);
      clearInterval(profId);
      clearInterval(unmapId);
      clearInterval(pendId);
      clearInterval(clockId);
    };
  }, []);

  async function handleTrain(operatorId: string) {
    setTrainingOperatorId(operatorId);
    setTrainResults(null);
    setTrainError(null);

    try {
      const r = await fetch("/api/faces/train-stored", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator_id: operatorId }),
      });
      const j = await r.json();

      if (j.status === "ok") {
        setTrainResults(j.results);
        // Remove this group from pending (it's been processed)
        setPendingGroups((prev) => prev.filter((g) => g.operator_id !== operatorId));
        // Refresh profiles
        const pr = await fetch("/api/faces/profiles", { cache: "no-store" });
        const pj = await pr.json();
        if (pj.status === "ok") setProfiles(pj.profiles);
      } else {
        setTrainError(j.message ?? "Training failed");
      }
    } catch (err) {
      setTrainError(err instanceof Error ? err.message : String(err));
    } finally {
      setTrainingOperatorId(null);
    }
  }

  async function handleMap(embeddingId: string) {
    if (!mapOperatorId) return;
    const op = operators.find((o) => o.id === mapOperatorId);
    if (!op) return;

    const name = op.name;
    const label = op.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const employee_id = op.id;

    setMapLoading(true);
    setMapStatus(null);

    try {
      const r = await fetch("/api/faces/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedding_id: embeddingId, name, label, employee_id }),
      });
      const j = await r.json();
      if (j.status === "ok") {
        setUnmappedFaces((prev) => prev.filter((f) => f.embedding_id !== embeddingId));
        setMappingId(null);
        setMapOperatorId("");
        const pr = await fetch("/api/faces/profiles", { cache: "no-store" });
        const pj = await pr.json();
        if (pj.status === "ok") setProfiles(pj.profiles);
      } else {
        setMapStatus(`Error: ${j.message}`);
      }
    } catch (err) {
      setMapStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMapLoading(false);
    }
  }

  const totalPendingImages = pendingGroups.reduce((sum, g) => sum + g.images.length, 0);

  return (
    <main className="min-h-screen bg-neutral-50 p-6 md:p-10 font-sans text-neutral-900">
      <header className="flex items-center justify-between flex-wrap gap-3 max-w-6xl mx-auto mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">OEE MES — Face Management</h1>
          <p className="text-neutral-600 text-sm mt-1">
            Train faces from device uploads, manage profiles, map unmapped faces
          </p>
        </div>
        <a
          href="/dashboard"
          className="text-xs font-mono text-neutral-500 hover:text-neutral-700 underline"
        >
          &larr; Main Dashboard
        </a>
      </header>

      {err && (
        <div className="max-w-6xl mx-auto mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Error:</strong> {err}
          <button
            type="button"
            onClick={() => setErr(null)}
            className="ml-3 text-red-600 hover:text-red-800 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Pending Training ──────────────────────────────────── */}
      <section className="max-w-6xl mx-auto mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Pending training ({pendingGroups.length} operator{pendingGroups.length !== 1 ? "s" : ""} · {totalPendingImages} image{totalPendingImages !== 1 ? "s" : ""})
        </h2>
        {pendingGroups.length === 0 ? (
          <div className="rounded-md border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            No pending uploads. When a device captures face images, they will appear here for training.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingGroups.map((group) => {
              const isTraining = trainingOperatorId === group.operator_id;
              return (
                <div
                  key={group.operator_id}
                  className="rounded-md border border-blue-200 bg-white overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-200">
                    <div>
                      <span className="text-sm font-semibold">{group.operator_name}</span>
                      <span className="text-xs text-neutral-500 font-mono ml-2">
                        {group.operator_id}
                      </span>
                      <span className="text-xs text-neutral-500 ml-2">
                        · {group.images.length} image{group.images.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isTraining}
                      onClick={() => handleTrain(group.operator_id)}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-400 text-white text-sm font-medium px-4 py-1.5 rounded"
                    >
                      {isTraining ? "Training…" : "Train"}
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {group.images.map((img) => (
                        <div
                          key={img.id}
                          className="relative rounded border border-neutral-200 overflow-hidden aspect-square"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.public_url}
                            alt={`Pending: ${group.operator_name}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 text-[9px] text-white font-mono">
                            {fmtAgo(img.uploaded_at, now)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {trainResults && (
          <div className="mt-3 rounded-md border border-neutral-200 bg-white p-4">
            <div className="text-sm font-medium mb-2">
              Training complete: {trainResults.filter((r) => r.status === "ok").length} of{" "}
              {trainResults.length} images processed successfully
            </div>
            <div className="space-y-1">
              {trainResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs font-mono">
                  <span
                    className={r.status === "ok" ? "text-emerald-600" : "text-red-600"}
                  >
                    {r.status === "ok" ? "[OK]" : "[FAIL]"}
                  </span>
                  <span className="text-neutral-700">Image {i + 1}</span>
                  {r.reason && (
                    <span className="text-neutral-500">— {r.reason}</span>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setTrainResults(null); setTrainError(null); }}
              className="mt-2 text-xs text-neutral-500 hover:text-neutral-700 underline"
            >
              Clear results
            </button>
          </div>
        )}
        {trainError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs font-mono text-red-600">
            Training error: {trainError}
            <button
              type="button"
              onClick={() => setTrainError(null)}
              className="ml-2 text-red-500 hover:text-red-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </section>

      {/* ── Trained Profiles ──────────────────────────────────── */}
      <section className="max-w-6xl mx-auto mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Trained profiles ({profiles.length})
        </h2>
        {profiles.length === 0 ? (
          <div className="rounded-md border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            No trained profiles yet. Train pending uploads above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {profiles.map((p) => (
              <div
                key={p.id}
                className="group flex items-center justify-between rounded-md border border-neutral-200 bg-white px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-neutral-500 font-mono">
                    {p.label}
                    {p.employee_id ? ` · ${p.employee_id}` : ""} ·{" "}
                    {p.embedding_count} embedding
                    {p.embedding_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={deletingProfile === p.id}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Delete profile "${p.name}" and all its embeddings?`
                      )
                    )
                      return;
                    setDeletingProfile(p.id);
                    try {
                      const r = await fetch(
                        `/api/faces/profiles?id=${encodeURIComponent(p.id)}`,
                        { method: "DELETE" }
                      );
                      const j = await r.json();
                      if (j.status === "ok") {
                        setProfiles((prev) => prev.filter((x) => x.id !== p.id));
                      } else {
                        setErr(`Delete failed: ${j.message}`);
                      }
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : String(e));
                    } finally {
                      setDeletingProfile(null);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600 text-lg leading-none disabled:cursor-not-allowed transition-opacity"
                  title="Delete profile"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Unmapped Faces ────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Unmapped faces ({unmappedFaces.length})
        </h2>
        {unmappedFaces.length === 0 ? (
          <div className="rounded-md border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            No unmapped faces. All detected faces are either recognized or dismissed.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {unmappedFaces.map((face) => (
              <div
                key={face.embedding_id}
                className="rounded-md border border-amber-200 bg-white overflow-hidden"
              >
                {face.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={face.image_url}
                    alt="Unmapped face"
                    className="w-full h-40 object-cover"
                  />
                ) : (
                  <div className="w-full h-40 bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm">
                    No image
                  </div>
                )}
                <div className="p-3">
                  <div className="text-xs text-neutral-500 font-mono mb-2">
                    {face.machine_id ?? "unknown"} · {fmtAgo(face.created_at, now)}
                  </div>

                  {mapStatus && mappingId === face.embedding_id && (
                    <div
                      className={`text-xs font-mono mb-2 ${
                        mapStatus.startsWith("Error")
                          ? "text-red-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {mapStatus}
                    </div>
                  )}

                  {mappingId === face.embedding_id ? (
                    <div className="space-y-2">
                      <select
                        value={mapOperatorId}
                        onChange={(e) => setMapOperatorId(e.target.value)}
                        className="border border-neutral-300 rounded px-2 py-1 text-sm w-full"
                      >
                        <option value="">Select operator...</option>
                        {operators.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.name} ({op.id})
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={mapLoading || !mapOperatorId}
                          onClick={() => handleMap(face.embedding_id)}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-400 text-white text-xs font-medium px-3 py-1 rounded"
                        >
                          {mapLoading ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMappingId(null);
                            setMapOperatorId("");
                            setMapStatus(null);
                          }}
                          className="border border-neutral-300 hover:bg-neutral-100 text-xs px-3 py-1 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMappingId(face.embedding_id);
                          setMapOperatorId("");
                          setMapStatus(null);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1 rounded"
                      >
                        Map
                      </button>
                      <button
                        type="button"
                        disabled={dismissingId === face.embedding_id}
                        onClick={async () => {
                          if (!window.confirm("Dismiss this unmapped face?")) return;
                          setDismissingId(face.embedding_id);
                          try {
                            const r = await fetch(
                              `/api/dashboard/unmapped-faces?id=${encodeURIComponent(
                                face.embedding_id
                              )}`,
                              { method: "DELETE" }
                            );
                            const j = await r.json();
                            if (j.status === "ok") {
                              setUnmappedFaces((prev) =>
                                prev.filter(
                                  (f) => f.embedding_id !== face.embedding_id
                                )
                              );
                            } else {
                              setErr(`Dismiss failed: ${j.message}`);
                            }
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : String(e));
                          } finally {
                            setDismissingId(null);
                          }
                        }}
                        className="border border-neutral-300 hover:bg-neutral-100 text-xs px-3 py-1 rounded disabled:opacity-50"
                      >
                        {dismissingId === face.embedding_id
                          ? "Dismissing…"
                          : "Dismiss"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="max-w-6xl mx-auto mt-10 text-xs text-neutral-400 font-mono">
        OEE MES · Dynatech × Codespire
      </footer>
    </main>
  );
}
