-- Add names table to existing database
-- Run this if you already have the database and don't want to reset

CREATE TABLE IF NOT EXISTS names (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  gender VARCHAR(10) DEFAULT 'neutral',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_names_active ON names(is_active);

-- Insert sample names (Indonesian names)
INSERT INTO names (name, gender) VALUES 
  ('budi', 'male'),
  ('andi', 'male'),
  ('agus', 'male'),
  ('deni', 'male'),
  ('eko', 'male'),
  ('fajar', 'male'),
  ('gilang', 'male'),
  ('hendra', 'male'),
  ('irwan', 'male'),
  ('joko', 'male'),
  ('dewi', 'female'),
  ('sari', 'female'),
  ('putri', 'female'),
  ('maya', 'female'),
  ('rina', 'female'),
  ('wati', 'female'),
  ('yuni', 'female'),
  ('ani', 'female'),
  ('sri', 'female'),
  ('lina', 'female'),
  ('alex', 'neutral'),
  ('rian', 'neutral'),
  ('dika', 'neutral'),
  ('yoga', 'neutral'),
  ('tara', 'neutral')
ON CONFLICT DO NOTHING;

SELECT 'Names table added successfully!' as message;
