-- Store the role selected when a wallet session is created.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS role VARCHAR(16);

UPDATE sessions s
SET role = p.role
FROM user_profiles p
WHERE p.user_address = s.user_address
  AND s.role IS NULL;

ALTER TABLE sessions ALTER COLUMN role SET NOT NULL;
ALTER TABLE sessions ADD CONSTRAINT sessions_role_check
  CHECK (role IN ('patient', 'doctor', 'lab_tech', 'pharmacist', 'hospital_admin', 'platform_admin'));