CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(120) UNIQUE NOT NULL,
  nickname VARCHAR(80) NOT NULL,
  bio TEXT,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trips (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  owner_id BIGINT NOT NULL,
  destination VARCHAR(120) NOT NULL,
  depart_date DATE NOT NULL,
  days INT NOT NULL,
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  transport VARCHAR(40),
  companion_count INT,
  gender_preference VARCHAR(40),
  status VARCHAR(30) DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS trip_days (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trip_id BIGINT NOT NULL,
  day_no INT NOT NULL,
  title VARCHAR(160),
  lodging VARCHAR(160),
  transport_plan VARCHAR(160)
);

CREATE TABLE IF NOT EXISTS budgets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trip_id BIGINT NOT NULL,
  category VARCHAR(40) NOT NULL,
  planned DECIMAL(10,2) NOT NULL,
  spent DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- 行程成员（在队 ACTIVE / 离队 LEFT）
CREATE TABLE IF NOT EXISTS trip_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trip_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  joined_nickname VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_member_trip_user (trip_id, user_id)
);

-- 多人共写旅行日记（每个行程一份，乐观版本号 + 发布冻结）
CREATE TABLE IF NOT EXISTS diaries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trip_id BIGINT NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  published_title VARCHAR(160) NULL,
  published_by BIGINT NULL,
  published_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 日记段落（作者归属 + 顺序 seq，发布时冻结顺序与昵称）
CREATE TABLE IF NOT EXISTS diary_paragraphs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  diary_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  author_nickname VARCHAR(80) NOT NULL,
  content TEXT NOT NULL,
  seq INT NOT NULL,
  KEY idx_paragraph_diary_seq (diary_id, seq)
);

-- 演示数据：三个用户口令均为 demo1234
--   alice@example.com  发起人 Alice
--   bob@example.com    成员 Bob
--   carol@example.com  成员 Carol
INSERT INTO users (id, email, nickname, password_hash) VALUES
  (1, 'alice@example.com', 'Alice', '$2a$10$U2Cwt7PiylYJz522gpDf3eF27nBarxiK/6j6LKlW3MLDoQZVpgWJi'),
  (2, 'bob@example.com',   'Bob',   '$2a$10$U2Cwt7PiylYJz522gpDf3eF27nBarxiK/6j6LKlW3MLDoQZVpgWJi'),
  (3, 'carol@example.com', 'Carol', '$2a$10$U2Cwt7PiylYJz522gpDf3eF27nBarxiK/6j6LKlW3MLDoQZVpgWJi')
ON DUPLICATE KEY UPDATE id = id;

-- 行程 1：2026-05-01 出发 5 天，按当前日期（2026-09）已结束，可直接演示发布
INSERT INTO trips (id, owner_id, destination, depart_date, days, budget_min, budget_max, transport, companion_count, gender_preference, status) VALUES
  (1, 1, '大理', '2026-05-01', 5, 3500, 5200, '公共交通', 3, '不限', 'FINISHED'),
  (2, 1, '青海湖', '2026-12-10', 7, 4800, 6800, '自驾', 3, '不限', 'OPEN')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO trip_members (trip_id, user_id, joined_nickname, status) VALUES
  (1, 1, 'Alice', 'ACTIVE'),
  (1, 2, 'Bob',   'ACTIVE'),
  (1, 3, 'Carol', 'LEFT'),
  (2, 1, 'Alice', 'ACTIVE'),
  (2, 2, 'Bob',   'ACTIVE')
ON DUPLICATE KEY UPDATE id = id;
