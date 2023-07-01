import { Runner } from '../utils.js'
import { FILE_LIST_INTERVAL, FILE_LIST_RETRY_INTERVAL, DOCKER_LOG_DIR, IGNORED_LOG_CONTAINERS, LOG_PARSERS } from '../config.js'
import { opendir } from 'node:fs/promises'
import { knex } from '../outputs/timescale.js'
import { Tail } from 'tail'

const noop = () => {}

/**
 * List directory recusively
 * - with 3 max levels
 * - only .log files
 * - only 1 per folder
 * */
async function tree(path, level = 0, files = []) {
	try {
		const dir = await opendir(path)
		const subDirs = []
		let hadFile = false // 1 file per folders
		for await (const dirent of dir) {
			if (dirent.isDirectory() && level < 3) {
				subDirs.push(path + '/' + dirent.name)
			} else if (!hadFile && (dirent.isFile() || dirent.isSymbolicLink()) && /\.log/.test(dirent.name)) {
				files.push(path + '/' + dirent.name)
				hadFile = true
			}
		}
		for (const path of subDirs) {
			await tree(path, level + 1, files)
		}
	} catch (err) {
		console.error('[ERR][IN-DOCKER-LOGS] Failed to list log directory', err.message)
	}
	return files
}

export default class K8Logs extends Runner {
	// Mapping of file => tail.stop
	#tails = {}
	#logsBuffer = {}

	constructor(outputs) {
		super(FILE_LIST_INTERVAL, FILE_LIST_RETRY_INTERVAL)

		if (!outputs.logs) {
			this.stop()
			throw new Error('[ERR][IN-DOCKER-LOGS] Missing logs outputs')
		}
		this.#logsBuffer = outputs.logs
	}

	/**
	 * Start tailing file
	 * @param {string} path
	 * @returns {Promise<() => void>} Cancel watching function
	 */
	async startTailing(path) {
		console.debug('[DEBUG][IN-DOCKER-LOGS] Watching', path)

		// Get last recorded log for this file
		let lastLogTime = (await knex.table('logs')
			.where('path', path)
			.max('time'))[0].max
		if (lastLogTime) lastLogTime = new Date(lastLogTime).toISOString()

		// Parse filename to labels
		// /var/log/pods/<namespace>_<pod-name>_<pod-id>/<container-name>/xxxx.log
		const fileparts = path.split(/[_/]/g).splice(-5, 4)
		const containerName = fileparts[3]
		if (IGNORED_LOG_CONTAINERS.includes(containerName)) return noop
		const labels = {
			ns: fileparts[0],
			pod: fileparts[1],
			ctn: containerName,
		}
		
		// Start tailing from the start
		const tail = new Tail(path, {
			fromBeginning: true,
			follow: true,
		})

		const handleLine = (path, labels, [time, stream, line]) => {
			// Already parsed
			const timestamp3decimal = time.replace(/(\.[0-9]{3})[0-9]+Z/, '$1Z')
			if (lastLogTime && lastLogTime > timestamp3decimal) return
			lastLogTime = timestamp3decimal

			// Add log to output
			try {
				labels.stream = stream
				const log = LOG_PARSERS(containerName)({
					time,
					stream,
					log: line,
				}, labels, path)
				if (log) this.#logsBuffer.push(log)
			} catch (err) {
				console.error('[ERR][IN-DOCKER-LOGS] Failed to parse log line', line)
			}
		}

		let buffer
		tail.on('line', line => {
			try {
				// https://github.com/kubernetes/design-proposals-archive/blob/main/node/kubelet-cri-logging.md
				// CRI log parsing
				let [time, stream, mode] = line.split(' ', 4)
				line = line.substring(time.length + stream.length + mode.length + 3)
				if (!time || !stream || !mode || !line) return

				// Partial line
				if (mode === 'P') {
					if (buffer && buffer[0] === time && buffer[1] === stream) buffer[2] += line
					else buffer = [time, stream, line]
					return
				} else {
					if (buffer) {
						handleLine(path, labels, buffer)
					}
					buffer = null
				}

				// Full line
				handleLine(path, labels, [time, stream, line])
			} catch (err) {
				console.warn('[WARN][IN-DOCKER-LOGS] Failed to parse log line', line)
				return
			}
		})
		tail.on('error', err => console.error('[ERR][IN-DOCKER-LOGS] Tail error', err.message))

		return tail.unwatch.bind(tail)
	}

	// List files, create/remove watchers
	async doRun() {
		try {
			const files = (await tree(DOCKER_LOG_DIR))
				.filter(file => /0\.log$/.test(file))
			const tails = this.#tails
			console.debug(`[DEBUG][IN-DOCKER-LOGS] List log files (${files.length} files)`)

			// Unwatch deleted files
			for (const file in tails) {
				if (!files.includes(file)) tails[file]()
			}

			for (const file of files) {
				// Already watched
				if (tails[file]) continue

				const startPromise = this.startTailing(file).catch(err => {
					console.error('[ERR][IN-DOCKER-LOGS]', err.message)
					delete tails[file]
					return noop
				})

				// Stop watching function
				tails[file] = () => {
					delete tails[file]
					startPromise.then(stop => stop())
				}
			}
		} catch (err) {
			console.error('[ERR][IN-DOCKER-LOGS]', err.message)
		}
	}

	stop() {
		const tails = this.#tails
		for (const file in tails) {
			tails[file]()
		}
	}
}