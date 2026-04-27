-- Seed data matching the QualityOS firmware simulator
-- Run after schema.sql in Supabase SQL editor

-- ═══════════════════════════════════════════════════════════════════════
-- Machines
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO machines (machine_id, name, shifts, lunch, breakdown_reasons, reject_reasons, lu_overtime_ms, beep_repeat_ms, capture_seconds) VALUES
  ('JYOTI-01', 'Jyoti #1', '{"A": "06:00-14:00", "B": "14:00-22:00"}', '12:00-12:30',
   '["Tool broke","Material issue","Awaiting setup","Power/utility","Coolant/fluid","Other"]',
   '["Dimension out","Surface finish","Dent/scratch","Plating defect","Other"]',
   60000, 10000, 5)
ON CONFLICT (machine_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Operators (PINs stored as plain text for dev — use bcrypt in prod)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO operators (id, name, pin_hash, role) VALUES
  ('OP-RK-042', 'Rakesh Kumar',  '0000', 'operator'),
  ('OP-SY-018', 'Suresh Yadav',  '1111', 'operator'),
  ('ST-AP-007', 'Amit Patil',    '1234', 'setter'),
  ('SV-MD-001', 'Mahesh Desai',  '9999', 'supervisor')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Parts
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO parts (part_number, description, setup, target_secs, machine_id) VALUES
  ('DT-4521-A', 'Steel bracket', 'S3', 120, 'JYOTI-01'),
  ('DT-6102-B', 'Al housing',    'S1', 195, 'JYOTI-01'),
  ('DT-7703-C', 'MS flange',     'S2', 105, 'JYOTI-01')
ON CONFLICT (part_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Operator Assignments (assigned by supervisor)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO operator_assignments (operator_id, machine_id, part_number, assigned_by) VALUES
  ('OP-RK-042', 'JYOTI-01', 'DT-4521-A', 'SV-MD-001'),
  ('OP-SY-018', 'JYOTI-01', 'DT-6102-B', 'SV-MD-001')
ON CONFLICT DO NOTHING;
