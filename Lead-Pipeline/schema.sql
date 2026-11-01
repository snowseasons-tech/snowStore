-- MariaDB analytics copy of the lead CSVs. The CSVs stay the source of truth;
-- sync_mariadb.py applies this file on every run, so keep each statement re-runnable.
-- Text columns are TEXT because hand edits and scraped values have no length limit.
-- row_key = sha256 of the row's identity, content_hash = sha256 of the whole row.

CREATE TABLE IF NOT EXISTS leads (
  row_key CHAR(64) NOT NULL PRIMARY KEY,
  content_hash CHAR(64) NOT NULL,
  company TEXT NOT NULL,
  domain TEXT,
  website TEXT,
  phone TEXT,
  title TEXT,
  description TEXT,
  domain_confidence VARCHAR(32),
  source_url TEXT,
  status TEXT,
  created_at DATETIME NULL,
  scraped_at DATETIME NULL,
  scrape_status TEXT,
  scrape_attempts INT NULL,
  extra JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_leads_domain (domain(191)),
  KEY idx_leads_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contacts (
  row_key CHAR(64) NOT NULL PRIMARY KEY,
  content_hash CHAR(64) NOT NULL,
  company TEXT NOT NULL,
  domain TEXT,
  email TEXT,
  email_type TEXT,
  same_domain TEXT,
  name TEXT,
  title TEXT,
  phone TEXT,
  source_url TEXT,
  scraped_at DATETIME NULL,
  extra JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_contacts_domain (domain(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS search_results (
  row_key CHAR(64) NOT NULL PRIMARY KEY,
  content_hash CHAR(64) NOT NULL,
  company TEXT NOT NULL,
  `rank` INT NULL,
  title TEXT,
  url TEXT,
  host TEXT,
  snippet TEXT,
  searched_at DATETIME NULL,
  extra JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_results_host (host(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS search_log (
  row_key CHAR(64) NOT NULL PRIMARY KEY,
  content_hash CHAR(64) NOT NULL,
  company TEXT NOT NULL,
  searched_at DATETIME NULL,
  ok INT NULL,
  n_results INT NULL,
  error TEXT,
  extra JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_log_searched (searched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
