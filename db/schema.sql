-- Bucks Haven Farm database (MariaDB / MySQL). Applied on every deploy by
-- scripts/migrate.mjs; every statement is safe to run again.
CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(200) NOT NULL DEFAULT '',
  email VARCHAR(320) UNIQUE,
  role ENUM('admin','employee') NOT NULL DEFAULT 'employee',
  password_hash VARCHAR(100) NULL,
  session_version INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  notes TEXT NULL,
  assigned_to CHAR(36) NULL,
  created_by CHAR(36) NULL,
  due_date DATE NULL,
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  done TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shifts (
  id CHAR(36) PRIMARY KEY,
  employee_id CHAR(36) NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS availability (
  id CHAR(36) PRIMARY KEY,
  employee_id CHAR(36) NOT NULL,
  week_start DATE NOT NULL,
  available_days LONGTEXT NOT NULL DEFAULT '{}',
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS time_off_requests (
  id CHAR(36) PRIMARY KEY,
  employee_id CHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NULL,
  status ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  reviewed_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS horses (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  notes TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  barn ENUM('log-barn','arena-barn') NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feeding_charts (
  id CHAR(36) PRIMARY KEY,
  horse_id CHAR(36) NOT NULL,
  am_feed TEXT NULL,
  pm_feed TEXT NULL,
  supplements TEXT NULL,
  special_notes TEXT NULL,
  responsible_employee CHAR(36) NULL,
  barn ENUM('log-barn','arena-barn') NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (horse_id) REFERENCES horses(id) ON DELETE CASCADE,
  FOREIGN KEY (responsible_employee) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feeding_logs (
  id CHAR(36) PRIMARY KEY,
  chart_id CHAR(36) NULL,
  horse_id CHAR(36) NULL,
  employee_id CHAR(36) NULL,
  feeding_type ENUM('AM','PM') NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT (CURRENT_DATE),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_feeding (horse_id, feeding_type, date),
  FOREIGN KEY (chart_id) REFERENCES feeding_charts(id) ON DELETE CASCADE,
  FOREIGN KEY (horse_id) REFERENCES horses(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  body TEXT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clock_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  user_name VARCHAR(200) NOT NULL DEFAULT '',
  action ENUM('in','out') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_notes (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  body TEXT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The farm's people (they set their passwords at /setup with the setup code).
INSERT IGNORE INTO profiles (id, name, email, role) VALUES
  ('8d3c2b0e-6a51-4f0e-9a3e-000000000001', 'James Rowan', 'james@northvaleunified.com', 'admin'),
  ('8d3c2b0e-6a51-4f0e-9a3e-000000000002', 'Cynthia Baker', 'cynthiarowan777@gmail.com', 'admin'),
  ('8d3c2b0e-6a51-4f0e-9a3e-000000000003', 'Theresa Rowan', 'theresarowan777@gmail.com', 'employee'),
  ('8d3c2b0e-6a51-4f0e-9a3e-000000000004', 'Landen Rowan', 'landenrowan@gmail.com', 'employee');
