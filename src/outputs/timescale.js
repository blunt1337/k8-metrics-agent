import Knex from 'knex'
import { TIMESCALE_URL, SAVE_INTERVAL, RETRY_INTERVAL, MAX_BATCH_INSERT, MAX_BUFFER_SIZE } from '../config.js'
import { Runner } from '../utils.js'

export const knex = Knex({
	client: 'pg',
	connection: TIMESCALE_URL,
	pool: {
		min: 1,
		max: 1,
	},
	asyncStackTraces: true,
})

class DataBuffer extends Runner {
	#table
	#data = []

	constructor(table) {
		super(SAVE_INTERVAL, RETRY_INTERVAL)
		this.#table = table
	}

	async save() {
		await this.run()
		this.stop()
	}

	/**
	 * Save buffer
	 */
	async doRun() {
		const data = this.#data
		if (!data) return

		try {
			while (data.length) {
				const chunk = data.slice(0, MAX_BATCH_INSERT)
				await knex.table(this.#table)
					.insert(chunk)
					.onConflict(knex.raw(`ON CONSTRAINT ${this.#table}_unique`))
					.ignore()
				data.splice(0, MAX_BATCH_INSERT)
			}
			console.debug(`[DEBUG][OUT-TIMESCALE][${this.#table}] Saved`)
		} catch (err) {
			console.error(`[ERR][OUT-TIMESCALE][${this.#table}] Error saving batch`, err.message)
			throw err
		}
	}

	/** Add data to buffer */
	push(log) {
		// Validate log
		try {
			this.validate(log)
		} catch (err) {
			console.error(`[ERR][OUT-TIMESCALE] Invalid data added to ${this.#table}`, err.message)
			return
		}

		// Add to queue
		const data = this.#data
		data.push(log)
		if (data.length > MAX_BUFFER_SIZE) {
			this.#data.shift()
		}
		console.debug('[DEBUG][OUT-TIMESCALE] Log added to queue', log)
	}

	// Method to override
	validate(log) {}
}

export class TimescaleMetrics extends DataBuffer {
	constructor() {
		super('metrics')
	}

	validate(log) {
		if (!log.time || isNaN(log.time)) throw new Error('Missing time')
		if (typeof log.labels === 'object') log.labels = JSON.stringify(log.labels)
		else log.labels = '{}'

		if (!log.name) throw new Error('Missing name')
		log.value = +log.value
		if (Number.isNaN(log.value)) throw new Error('Missing or invalid value')
	}
}

export class TimescaleLogs extends DataBuffer {
	constructor() {
		super('logs')
	}

	validate(log) {
		if (!log.time || isNaN(log.time)) throw new Error('Missing time')
		if (typeof log.labels === 'object') log.labels = JSON.stringify(log.labels)
		else log.labels = '{}'

		if (!log.level) log.level = 'LOG'
		else if (!['TRACE', 'LOG', 'WARN', 'ERR', 'INFO', 'DEBUG'].includes(log.level)) throw new Error('Invalid level: ' + log.level)
		log.value = JSON.stringify(log.value)
	}
}