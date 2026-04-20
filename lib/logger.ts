type LogFields = {
  route: string;
  method: string;
  machine_id?: string;
  event_id?: string;
  count?: number;
  status: number;
  latency_ms: number;
  note?: string;
};

export function logRequest(fields: LogFields): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
}

export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
