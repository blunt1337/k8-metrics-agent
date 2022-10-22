/**
 * Parse a docker log line {"log":"My log line text content","time":"xxxx","stream":"stdout"}
 * @param {Object} line Log line from docker
 * @param {Object} labels labels generated from filename
 * @param {string} path File path
 */
export default function parseLog(line, labels, path) {
	// Remove colors/formatting from value
	const value = line.log.replace(/\033\[[0-9;]+m/g, '')

	return {
		time: new Date(line.time),
		path,
		labels,
		level: line.stream === 'stderr' ? 'ERR' : 'LOG',
		value,
	}
}