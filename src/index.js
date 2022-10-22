import { GRACEFUL_TIMEOUT } from './config.js'
import { TimescaleMetrics, TimescaleLogs } from './outputs/timescale.js'
import K8Metrics from './inputs/k8-metrics.js'
import K8Logs from './inputs/k8-logs.js'

// Noop for console.debug if disabled
if (!process.env.DEBUG) {
	console.debug = () => {}
}

// Outputs
const outputs = {
	metrics: new TimescaleMetrics(),
	logs: new TimescaleLogs(),
}

// Inputs
const inputs = {
	k8_metrics: new K8Metrics(outputs),
	k8_logs: new K8Logs(outputs),
}

// Graceful shutdown
async function gracefullShutdown(err_or_code) {
	console.debug('[DEBUG] Graceful shutdown')

	// Stop inputs
	for (const key in inputs) {
		if (inputs[key] && inputs[key].stop) {
			try {
				inputs[key].stop()
			} catch (err) {
				console.error(err)
			}
		}
	}

	// Save buffers (with timeout)
	await Promise.all(Object.values(outputs).map(async buffer => {
		try {
			await Promise.race([
				buffer.save(),
				new Promise(resolve => setTimeout(resolve, GRACEFUL_TIMEOUT)),
			])
		} catch (err) {
			console.error('[ERR] Failed to save last buffer:', err)
		}
	}))

	// Shutdown from error
	if (err_or_code instanceof Error) {
		console.error('[ERR] ' + err_or_code)
		err_or_code = 1
	}

	process.exit(err_or_code)
}
process.on('uncaughtException', gracefullShutdown)
process.on('unhandledRejection', gracefullShutdown)
process.on('SIGTERM', gracefullShutdown)