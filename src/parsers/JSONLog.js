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
		if (line.level) {
			line.level = value.level
			delete value.level
		}

		// Change replace "log"
		line.log = value
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