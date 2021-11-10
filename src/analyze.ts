import { CancellationToken, DocumentHighlight, FoldingRange, Progress, Range, TextDocument } from "vscode"
import { State, View } from "./state"

const PROGRESS_REPORT_DELAY = 500 // show progress report only if the scan takes more than this msec
const PROGRESS_REPORT_FREQ = 200 // update progress report every this many msec

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function log(text: string) {
    // console.log(`condenser[${new Date().toJSON()}]: analyze: ${text}`)
}

export default async function analyze(
    progress: Progress<{ message?: string; increment?: number }>,
    token: CancellationToken,
    state: State,
    filter: string
): Promise<void> {
    return new Promise<void>((resolve) => {
        function wrapUp(error: string, view?: View) {
            log(
                `${state.id}: filter=[${filter}] error=[${error}] matches=${view?.matches || 0} ranges=${
                    view?.ranges?.length || 0
                } highlights=${view?.highlights?.length || 0}`
            )
            state.filter = filter
            state.error = error
            state.view = view
            state.busy = false
            resolve()
        }
        if (!filter) {
            return wrapUp("")
        }
        state.busy = true
        state.abort = false

        try {
            new RegExp(filter) // this is a validity check
        } catch (err) {
            return wrapUp("not a valid regular expression")
        }
        log(`${state.id}: [${filter}]: started ...`)

        let scanned = 0
        return scan(state.document, filter, (line: number, lines: number, matches: number) => {
            progress.report({
                message: `line ${line} - ${matches} matches found`,
                increment: (100 * (line - scanned)) / lines,
            })
            scanned = line
            return state.abort || token.isCancellationRequested
        })
            .then((view) => {
                log(`${state.id}:  [${filter}]: ${view.error || "completed"}`)

                if (token.isCancellationRequested) {
                    state.stop() // the user clicked on cancel - stop a possibly pending run too
                }
                const error = view.error || (!view.matches && "no matches") || ""
                wrapUp(error, error ? undefined : view)
            })
            .catch((err) => {
                wrapUp(`${err instanceof Error ? err.message : err}`)
            })
    })
}

async function scan(
    document: TextDocument,
    filter: string,
    cancel: (line: number, lines: number, matches: number) => boolean
): Promise<View> {
    const ranges: FoldingRange[] = []
    const highlights: DocumentHighlight[] = []
    let matches = 0

    if (filter.length) {
        try {
            const regExp = new RegExp(filter, "g")

            const lineCount = document.lineCount
            let rangeStart = -1
            let nextCheck = Date.now() + PROGRESS_REPORT_DELAY
            const initialMemory = process.memoryUsage().heapUsed // memory before start
            log(`scan: memory usage: ${Math.floor(initialMemory / 1024 / 1024)} MB`)

            for (let idx = 0; idx < lineCount; idx++) {
                // report progress and check exit conditions every 1000 lines
                if (idx % 1000 === 0) {
                    const now = Date.now()
                    if (nextCheck < now) {
                        nextCheck = now + PROGRESS_REPORT_FREQ
                        if (cancel(idx, lineCount, matches)) {
                            return { error: "aborted" }
                        }

                        await new Promise((resolve) => setTimeout(resolve, 0)) // yield

                        const memory = process.memoryUsage().heapUsed
                        log(`scan: memory usage: ${Math.floor(memory / 1024 / 1024)} MB`)
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
                        highlights.push(new DocumentHighlight(new Range(idx, pos, idx, pos + match.length)))
                    })
                }
                if (range !== undefined) {
                    ranges.push(new FoldingRange(range[0], range[1])) // close the current range
                }
            }
            if (rangeStart >= 0 && rangeStart !== lineCount - 1) {
                ranges.push(new FoldingRange(rangeStart, lineCount - 1)) // everything after the last matching line
            }

            log(`scan: memory usage: ${Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)} MB`)
        } catch (err) {
            log(`scan: ${err instanceof Error ? err.message : err}`)
        }
    }

    return { ranges: ranges, highlights: highlights, matches: matches }
} // scan()
