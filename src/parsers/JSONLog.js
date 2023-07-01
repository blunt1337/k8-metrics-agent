/**
 * Parse a docker log line encoded in JSON {"log":"{MY JSON OBJECT TO DECODE}","time":"xxxx","stream":"stdout"}
 * @param {Object} line Log line from docker
 * @param {object} labels labels generated from filename
 * @param {string} path File path
 */
export default function parseJSONLog(line, labels, path) {
	try {
		const value = JSON.parse(line.log)

		// Override time
		if (value.time) {
			line.time = value.time
			delete value.time
		}

		// Override level
		if (value.level) {
			line.level = value.level
			delete value.level
		}

		// Transfert ip and uid
		if (value.ip) {
			labels.ip = value.ip
			delete value.ip
		}
		if (value.uid) {
			labels.uid = value.uid
			delete value.uid
		}

		// Replace "log"
		line.log = value.logs || value
	} catch (err) {
		console.warn('[WARN][IN-DOCKER-LOGS] Failed parsing log value', line.log)
	}

	return {
		time: new Date(line.time),
		path,
		labels,
		level: line.level || (line.stream === 'stderr' ? 'ERR' : 'LOG'),
		value: line.log,
	}
}