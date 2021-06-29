import * as vscode from "vscode"

export default function (
    state: {
        filter: string
        ranges: vscode.FoldingRange[]
        highlights: vscode.DocumentHighlight[]
    },
    document: vscode.TextDocument
) {
    var regExp: RegExp
    try {
        if (state.filter.length === 0) {
            return
        }
        regExp = new RegExp(state.filter, "g")
    } catch (e) {
        return // not a valid regular expression"
    }
    state.ranges = []
    state.highlights = []
    const lineCount = document.lineCount
    let rangeStart = -1
    for (let idx = 0; idx < lineCount; idx++) {
        const line = new String(document.lineAt(idx).text)
        const matches = line.match(regExp)
        //let matches = regExp.exec(document.lineAt(idx).text)
        let range: number[] | undefined
        if (matches) {
            // found a line with a regex match; do not add ranges consisting of just one line
            if (rangeStart < 0 && idx > 1) {
                range = [0, idx - 1] // everything before the first matching line
            } else if (rangeStart >= 0 && rangeStart !== idx - 1) {
                range = [rangeStart, idx - 1] // everything before the first matching line
            }
            rangeStart = idx // start a new range
            // highlight the matches in the text
            let pos = -1
            matches.forEach((match) => {
                pos = line.indexOf(match, pos + 1)
                state.highlights.push(new vscode.DocumentHighlight(new vscode.Range(idx, pos, idx, pos + match.length)))
            })
        }
        if (range !== undefined) {
            state.ranges.push(new vscode.FoldingRange(range[0], range[1])) // close the current range
        }
    }
    if (rangeStart >= 0 && rangeStart !== lineCount - 1) {
        state.ranges.push(new vscode.FoldingRange(rangeStart, lineCount - 1)) // everything after the last matching line
    }
} // condenser()
