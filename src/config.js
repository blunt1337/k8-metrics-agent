import { readFileSync } from 'node:fs'
import parseDefaultLog from './parsers/defaultLog.js'
import parseJSONLog from './parsers/JSONLog.js'
import parsePrometheusMetrics from './parsers/prometheus.js'

const ENV = process.env

// ----
// -- Global settings

// When app is stopped, the time allowed to save remaining data
export const GRACEFUL_TIMEOUT = 10_000

// ----
// -- Timescale output config

// Save to database interval (after a success)
export const SAVE_INTERVAL = +ENV.SAVE_INTERVAL || 30_000
// Save to database interval (after a failure)
export const RETRY_INTERVAL = +ENV.RETRY_INTERVAL || 10_000
// Maximum records per save interval
export const MAX_BUFFER_SIZE = +ENV.MAX_BUFFER_SIZE || 1_000
// Maximum records per batch insert
export const MAX_BATCH_INSERT = +ENV.MAX_BATCH_INSERT || 100
// URL of the timescale server
export const TIMESCALE_URL = ENV.TIMESCALE_URL || 'postgres://timescale:timescalepwd@host.docker.internal/timescale'

// ----
// -- Kubernetes metrics input config

// Time interval to get metrics (after a success)
export const K8_METRICS_SCRAP_INTERVAL = 60_000
// Time interval to get metrics (after a failure)
export const K8_METRICS_SCRAP_RETRY_INTERVAL = 10_000
// Node's metric api url
export const K8_API_URL = new URL(`https://${ENV.KUBERNETES_SERVICE_HOST}:${ENV.KUBERNETES_SERVICE_PORT}/api/v1/nodes/${ENV.NODE_NAME}/proxy/metrics/resource`)
// Node's api token
export const K8_TOKEN = readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token')
// Parser to use
export const K8_METRICS_PARSER = parsePrometheusMetrics

// ----
// -- Kubernetes container logs input config

// Time interval to list logs files (after a success)
export const FILE_LIST_INTERVAL = 30_000
// Time interval to list logs files (after a failure)
export const FILE_LIST_RETRY_INTERVAL = 10_000
// Directory of logs
export const DOCKER_LOG_DIR = '/var/log/pods'
// Containers with JSON log format
export const JSON_LOG_CONTAINERS = ['web-api', 'web-api-unsafe', 'web-echo', 'worker']
// Container names where logs will not be saved
export const IGNORED_LOG_CONTAINERS = ['metrics-agent']
// Parser by container name
export const LOG_PARSERS = containerName => {
	if (JSON_LOG_CONTAINERS.includes(containerName)) return parseJSONLog
	//TODO: haproxy
	return parseDefaultLog
}