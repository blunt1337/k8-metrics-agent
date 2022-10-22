import { Runner } from '../utils.js'
import { FILE_LIST_INTERVAL, FILE_LIST_RETRY_INTERVAL, DOCKER_LOG_DIR, JSON_LOG_CONTAINERS, LOG_PARSERS } from '../config.js'
import { opendir } from 'node:fs/promises'
import { knex } from '../outputs/timescale.js'
import { Tail } from 'tail'

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
		tail.on('line', line => {
			try {
				line = JSON.parse(line)
				if (!line.time || !line.log) return
			} catch (err) {
				console.warn('[WARN][IN-DOCKER-LOGS] Failed to parse log line', line)
				return
			}

			// Already parsed
			const timestamp3decimal = line.time.replace(/(\.[0-9]{3})[0-9]+Z/, '$1Z')
			if (lastLogTime && lastLogTime > timestamp3decimal) return
			lastLogTime = timestamp3decimal

			// Add log to output
			try {
				const log = LOG_PARSERS(containerName)(line, labels, path)
				if (log) this.#logsBuffer.push(log)
			} catch (err) {
				console.error('[ERR][IN-DOCKER-LOGS] Failed to parse log line', err.message)
			}
		})
		tail.on('error', err => console.error('[ERR][IN-DOCKER-LOGS] Tail error', err.message))

		return tail.unwatch.bind(tail)
	}

	// List files, create/remove watchers
	async doRun() {
		try {
			const files = await tree(DOCKER_LOG_DIR)
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

/*
name-space_container-name(-xxxxx)?-xxxxx_xxx-xxx-xxx-xxx-xxx/container-name/
/var/log/pods/<namespace>_<pod_name>_<pod_id>/<container_name>/xxxx.log

{"log":"2022-10-15T16:37:20.554749Z 0 [Warning] [MY-011068] [Server] The syntax '--skip-host-cache' is deprecated and will be removed in a future release. Please use SET GLOBAL host_cache_size=0 instead.\n","stream":"stderr","time":"2022-10-15T16:37:20.556845519Z"}
{"log":"2022-10-15T16:37:20.555300Z 0 [Warning] [MY-010918] [Server] 'default_authentication_plugin' is deprecated and will be removed in a future release. Please use authentication_policy instead.\n","stream":"stderr","time":"2022-10-15T16:37:20.556867199Z"}

max line length
*/