// Parse api response
const lineRegex = /^(?<name>[^\s{]+)\s*(\{(?<labels>.*)\})?\s*(?<number>[+-]?(Inf|NaN|[0-9.e+-]+))\s*(?<timestamp>[0-9]+)$/u
const labelRegex = /^,?(?<name>[^=]+)=(?<string>"(\\(["\\\\/bfnrt])|[^"\\]+)*")/u

/**
 * Parse prometheus metric file
 * @param {string} data Log line from docker
 */
export default function parseMetrics(data, result) {
	const lines = data.split('\n')
	for (const line of lines) {
		if (line[0] === '#') continue
		const match = lineRegex.exec(line)
		if (!match || !match.groups) continue
		const groups = match.groups
		
		// Log data
		const log = {
			time: new Date(+groups.timestamp),
			labels: {},
			name: groups.name,
			value: +groups.number || groups.number,
		}
		
		// Parse labels
		if (groups.labels) {
			let labelMatch
			let text = groups.labels
			while ((labelMatch = labelRegex.exec(text))) {
				text = text.substring(labelMatch[0].length)
				let { name, string } = labelMatch.groups
				try {
					string = JSON.parse(string) || string
				} catch (err) {}
				log.labels[name] = string
			}
		}
		result.push(log)
	}
}