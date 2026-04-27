import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const machine_id = url.searchParams.get("machine_id");
  const shift = url.searchParams.get("shift");

  const sb = supabase();

  // Today midnight (server timezone)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // --- Three parallel queries ---

  // 1. Active sessions (logged_out_at IS NULL)
  let sessQ = sb
    .from("auth_sessions")
    .select("id, operator_id, machine_id, shift, logged_in_at")
    .is("logged_out_at", null)
    .order("logged_in_at", { ascending: false });
  if (machine_id) sessQ = sessQ.eq("machine_id", machine_id);
  if (shift) sessQ = sessQ.eq("shift", shift);

  // 2. Cycle-complete events for today
  let eventsQ = sb
    .from("events")
    .select("event_id, machine_id, timestamp, payload")
    .eq("event_type", "cycle_complete")
    .gte("timestamp", todayStart.toISOString())
    .order("timestamp", { ascending: false })
    .limit(5000);
  if (machine_id) eventsQ = eventsQ.eq("machine_id", machine_id);

  // 3. Parts catalog (for target_secs)
  const partsQ = sb
    .from("parts")
    .select("part_number, description, target_secs, machine_id")
    .eq("active", true);

  const [sessResult, eventsResult, partsResult] = await Promise.all([
    sessQ,
    eventsQ,
    partsQ,
  ]);

  if (sessResult.error) {
    return NextResponse.json(
      { status: "error", message: sessResult.error.message },
      { status: 500 }
    );
  }
  if (eventsResult.error) {
    return NextResponse.json(
      { status: "error", message: eventsResult.error.message },
      { status: 500 }
    );
  }

  const sessions = sessResult.data ?? [];
  const cycleEvents = eventsResult.data ?? [];
  const parts = partsResult.data ?? [];

  // Build operator lookup from sessions
  const operatorIds = [
    ...new Set(sessions.map((s) => s.operator_id)),
  ];

  // Also gather operator IDs from event payloads
  for (const ev of cycleEvents) {
    const opId = (ev.payload as Record<string, unknown>)?.operator_id as
      | string
      | undefined;
    if (opId && !operatorIds.includes(opId)) operatorIds.push(opId);
  }

  // Fetch operator details
  let opMap = new Map<string, { name: string; role: string }>();
  if (operatorIds.length > 0) {
    const { data: operators } = await sb
      .from("operators")
      .select("id, name, role")
      .in("id", operatorIds);
    opMap = new Map(
      (operators ?? []).map((o) => [o.id, { name: o.name, role: o.role }])
    );
  }

  // Build parts lookup
  const partMap = new Map(
    parts.map((p) => [
      p.part_number,
      {
        description: p.description,
        target_secs: p.target_secs,
        machine_id: p.machine_id,
      },
    ])
  );

  // --- Aggregate cycle events by operator -> part ---

  // operator_id -> part_number -> cycle times array
  const opPartTimes = new Map<string, Map<string, number[]>>();
  // operator_id -> part_number -> last cycle time (first event seen, since ordered desc)
  const opPartLast = new Map<string, Map<string, number>>();

  for (const ev of cycleEvents) {
    const payload = ev.payload as Record<string, unknown> | null;
    if (!payload) continue;

    const opId = payload.operator_id as string | undefined;
    const partNum = payload.part_number as string | undefined;
    const cycleSecs = payload.cycle_time_secs as number | undefined;

    if (!opId || !partNum || cycleSecs == null) continue;

    if (!opPartTimes.has(opId)) opPartTimes.set(opId, new Map());
    const partsMap = opPartTimes.get(opId)!;
    if (!partsMap.has(partNum)) partsMap.set(partNum, []);
    partsMap.get(partNum)!.push(cycleSecs);

    // Track last cycle (events are desc, first seen = latest)
    if (!opPartLast.has(opId)) opPartLast.set(opId, new Map());
    if (!opPartLast.get(opId)!.has(partNum)) {
      opPartLast.get(opId)!.set(partNum, cycleSecs);
    }
  }

  // Build operator_stats array
  type PartStat = {
    part_number: string;
    description: string;
    target_secs: number;
    count: number;
    avg_cycle_secs: number;
    min_cycle_secs: number;
    max_cycle_secs: number;
    last_cycle_secs: number;
  };

  type OperatorStat = {
    operator_id: string;
    name: string;
    role: string;
    total_parts: number;
    avg_efficiency: number;
    parts: PartStat[];
  };

  const operatorStats: OperatorStat[] = [];

  for (const [opId, partsMap] of opPartTimes) {
    const opInfo = opMap.get(opId) ?? { name: opId, role: "unknown" };
    let totalParts = 0;
    let efficiencySum = 0;
    let efficiencyCount = 0;
    const partsList: PartStat[] = [];

    for (const [partNum, times] of partsMap) {
      const partInfo = partMap.get(partNum);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      const last = opPartLast.get(opId)?.get(partNum) ?? avg;
      const target = partInfo?.target_secs ?? 0;

      totalParts += times.length;
      if (target > 0) {
        efficiencySum += (target / avg) * 100;
        efficiencyCount++;
      }

      partsList.push({
        part_number: partNum,
        description: partInfo?.description ?? partNum,
        target_secs: target,
        count: times.length,
        avg_cycle_secs: Math.round(avg * 10) / 10,
        min_cycle_secs: min,
        max_cycle_secs: max,
        last_cycle_secs: last,
      });
    }

    operatorStats.push({
      operator_id: opId,
      name: opInfo.name,
      role: opInfo.role,
      total_parts: totalParts,
      parts: partsList.sort((a, b) =>
        a.part_number.localeCompare(b.part_number)
      ),
      avg_efficiency:
        efficiencyCount > 0
          ? Math.round((efficiencySum / efficiencyCount) * 10) / 10
          : 0,
    });
  }

  // Sort by total_parts descending
  operatorStats.sort((a, b) => b.total_parts - a.total_parts);

  // Build active_sessions with operator info
  const activeSessions = sessions.map((s) => ({
    id: s.id,
    operator_id: s.operator_id,
    name: opMap.get(s.operator_id)?.name ?? s.operator_id,
    role: opMap.get(s.operator_id)?.role ?? "unknown",
    machine_id: s.machine_id,
    shift: s.shift,
    logged_in_at: s.logged_in_at,
  }));

  // Summary
  const totalPartsToday = operatorStats.reduce(
    (sum, o) => sum + o.total_parts,
    0
  );
  const opsWithEfficiency = operatorStats.filter(
    (o) => o.avg_efficiency > 0
  );
  const avgEfficiency =
    opsWithEfficiency.length > 0
      ? Math.round(
          (opsWithEfficiency.reduce((sum, o) => sum + o.avg_efficiency, 0) /
            opsWithEfficiency.length) *
            10
        ) / 10
      : 0;

  return NextResponse.json({
    status: "ok",
    server_time: new Date().toISOString(),
    active_sessions: activeSessions,
    operator_stats: operatorStats,
    summary: {
      total_operators_active: sessions.length,
      total_parts_today: totalPartsToday,
      avg_efficiency: avgEfficiency,
    },
  });
}
