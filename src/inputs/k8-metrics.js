import { K8_METRICS_SCRAP_INTERVAL, K8_METRICS_SCRAP_RETRY_INTERVAL, K8_API_URL, K8_TOKEN, K8_METRICS_PARSER } from '../config.js'
import { httpRequest, Runner } from '../utils.js'

// Start scrapping
export default class K8Metrics extends Runner {
	#metricsBuffer = {}

	constructor(outputs) {
		super(K8_METRICS_SCRAP_INTERVAL, K8_METRICS_SCRAP_RETRY_INTERVAL)

		if (!outputs.metrics) {
			this.stop()
			throw new Error('[ERR][IN-K8-METRICS] Missing metrics outputs')
		}
		this.#metricsBuffer = outputs.metrics
	}

	async doRun() {
		try {
			console.debug('[DEBUG][IN-K8-METRICS] Pulling api', K8_API_URL + '')
			const { data } = await httpRequest('GET', K8_API_URL, null, {
				headers: {
					Authorization: 'Bearer ' + K8_TOKEN,
				},
			})

			// Parse and push metrics
			K8_METRICS_PARSER(data, this.#metricsBuffer)
		} catch (err) {
			console.error('[ERR][IN-K8-METRICS] Error kubelet API:', err.message, err.data)
			throw err
		}
	}
}