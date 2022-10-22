import https from 'node:https'
import http from 'node:http'

// Class that calls internal method 'doRun' at interval of time
export class Runner {
	#timeoutId = -1
	#interval
	#retryInterval

	constructor(interval, retryInterval) {
		this.#interval = interval
		this.#retryInterval = retryInterval
		setImmediate(this.run.bind(this))
	}

	/**
	 * Call doRun after 'interval' and after 'retryInterval' if an error is returned
	 * @param {string} table Buffer/table's name
	 */
	async run() {
		clearTimeout(this.#timeoutId)

		try {
			await this.doRun()
		} catch (err) {
			this.#timeoutId = setTimeout(this.run.bind(this), this.#retryInterval)
			return
		}
		this.#timeoutId = setTimeout(this.run.bind(this), this.#interval)
	}

	//
	stop() {
		clearTimeout(this.#timeoutId)
	}

	// Method to override
	async doRun() {}
}

/**
 * Http call
 * @return {Promise}
 */
export const httpRequest = (method, url, data = null, options = {}) => new Promise((resolve, reject) => {
	if (!(url instanceof URL)) {
		try {
			url = new URL(url)
		} catch (err) {
			reject(err)
		}
	}

	options = {
		hostname: url.hostname,
		port: url.port || (url.protocol === 'https:' ? 443 : 80),
		path: url.pathname,
		method: method || 'GET',
		...options,
	}
	const caller = url.protocol === 'https:' ? https : http

	// Make request
	const req = caller.request(options, res => {
		// Content
		let data = ''
		res.on('data', d => data += d)
		res.on('end', () => {
			if (res.statusCode < 200 || res.statusCode >= 300) {
				const err = new Error('Response code ' + res.statusCode)
				err.statusCode = res.statusCode
				err.data = data
				reject(err)
			} else {
				resolve({
					statusCode: res.statusCode,
					headers: res.headers,
					data,
				})
			}
		})
	})
	req.on('error', reject)
	if (data) req.write(data)
	req.end()
})