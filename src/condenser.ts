import * as vscode from "vscode"

const PROGRESS_REPORT_DELAY = 500 // show progress report only if the scan takes more than this msec
const PROGRESS_REPORT_FREQ = 200 // update progress report every this many msec

function log(text: string) {
    // Uncomment this to enable logging
    // console.log(`condenser[${new Date().toJSON()}]: ${text}`)
}

export default async function (
    document: vscode.TextDocument,
    filter: string,
    cancel: (line: number, lines: number, matches: number) => boolean
): Promise<{
    ranges?: vscode.FoldingRange[]
    highlights?: vscode.DocumentHighlight[]
    matches?: number
    error?: string
}> {
    let ranges: vscode.FoldingRange[] = []
    let highlights: vscode.DocumentHighlight[] = []
    let matches = 0

    if (filter.length) {
        try {
            let regExp = new RegExp(filter, "g")

            const lineCount = document.lineCount
            let rangeStart = -1
            let timestamp = Date.now() + PROGRESS_REPORT_DELAY
            let initialMemory = process.memoryUsage().heapUsed // memory before start
            log(`condenser: memory usage: ${Math.floor(initialMemory / 1024 / 1024)} MB`)

            for (let idx = 0; idx < lineCount; idx++) {

                // report progress and check exit conditions every 1000 lines
                if ((idx % 1000) === 0) {
                    let now = Date.now()
                    if (timestamp < now) {
                        timestamp = now + PROGRESS_REPORT_FREQ
                        if (cancel(idx, lineCount, matches)) {
                            return { error: "aborted" }
                        }
                        await new Promise(resolve => setTimeout(resolve, 0)) // yield

                        let memory = process.memoryUsage().heapUsed
                        log(`condenser: memory usage: ${Math.floor(memory / 1024 / 1024)} MB`)
                        if (memory > initialMemory * 10) {
                            return { error: `too many hits - make it simpler` }
                        }
                    }
                }

                const line = new String(document.lineAt(idx).text)
                const lineMatches = line.match(regExp)
                // let lineMatches = regExp.exec(document.lineAt(idx).text)

                let range: number[] | undefined
                if (lineMatches) {
                    ++matches
                    // found a line with a regex match; do not add ranges consisting of just one line
                    if (rangeStart < 0 && idx > 1) {
                        range = [0, idx - 1] // everything before the first matching line
                    } else if (rangeStart >= 0 && rangeStart !== idx - 1) {
                        range = [rangeStart, idx - 1]
                    }
                    rangeStart = idx // start a new range
                    // highlight individual matches within the line
                    let pos = -1
                    lineMatches.forEach((match) => {
                        pos = line.indexOf(match, pos + 1)
                        highlights.push(new vscode.DocumentHighlight(new vscode.Range(idx, pos, idx, pos + match.length)))
                    })
                }
                if (range !== undefined) {
                    ranges.push(new vscode.FoldingRange(range[0], range[1])) // close the current range
                }
            }
            if (rangeStart >= 0 && rangeStart !== lineCount - 1) {
                ranges.push(new vscode.FoldingRange(rangeStart, lineCount - 1)) // everything after the last matching line
            }

            log(`condenser: memory usage: ${Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)} MB`)
        } catch (e) {
            log(`condenser: ${e.message}`)
        }
    }

    return { ranges: ranges, highlights: highlights, matches: matches }

} // condenser()
