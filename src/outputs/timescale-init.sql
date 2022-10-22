-- Logs table
CREATE TYPE log_levels AS ENUM ('TRACE', 'LOG', 'WARN', 'ERR', 'INFO', 'DEBUG');
CREATE TABLE logs (
	time TIMESTAMP(3) NOT NULL,
	path TEXT NOT NULL,
	labels JSONB NOT NULL,
	level LOG_LEVELS NOT NULL,
	value JSON NOT NULL,
	CONSTRAINT logs_unique UNIQUE (time, path, level)
);
SELECT create_hypertable('logs', 'time');

CREATE INDEX idx_logs_labels ON logs USING GIN (labels);
CREATE INDEX idx_logs_value_action ON logs ((value->>'action'));
CREATE INDEX idx_logs_value_ip ON logs ((value->>'ip'));
CREATE INDEX idx_logs_value_uid ON logs ((value->>'uid'));
CREATE INDEX idx_logs_level ON logs (level, time DESC);
CREATE INDEX idx_logs_path ON logs (path, time DESC);

-- Metrics table
CREATE TABLE metrics (
	time TIMESTAMP(3) NOT NULL,
	labels JSONB NOT NULL,
	name TEXT NOT NULL,
	value DOUBLE PRECISION NULL,
	CONSTRAINT metrics_unique UNIQUE (time, name, value)
);
SELECT create_hypertable('metrics', 'time');

CREATE INDEX idx_metrics_labels ON metrics USING GIN (labels);
CREATE INDEX idx_metrics_name ON metrics (name, time DESC);
