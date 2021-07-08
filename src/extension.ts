import * as vscode from "vscode"
import condenser from "./condenser"

const LIVE_INPUT_UPDATE_DELAY = 200 // in msec

export function activate(context: vscode.ExtensionContext) {
    let state: {
        document: vscode.TextDocument | undefined
        histData: string[]
        histPos: number
        view: {
            ranges: vscode.FoldingRange[]
            highlights: vscode.DocumentHighlight[]
        }
        accepted: boolean
    } = {
        document: undefined,
        histData: [""],
        histPos: -1,
        view: {
            ranges: [],
            highlights: [],
        },
        accepted: false,
    }

    let foldingRangeProvider = new (class implements vscode.FoldingRangeProvider {
        provideFoldingRanges(document: vscode.TextDocument) {
            return document === state.document ? state.view.ranges : []
        }
        onDidChangeEmitter = new vscode.EventEmitter<void>()
        onDidChangeFoldingRanges = this.onDidChangeEmitter.event
    })()
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider({ scheme: "file" }, foldingRangeProvider))
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider({ scheme: "untitled" }, foldingRangeProvider))

    let highlightProvider = new (class implements vscode.DocumentHighlightProvider {
        provideDocumentHighlights(document: vscode.TextDocument) {
            return document === state.document ? state.view.highlights : []
        }
    })()
    context.subscriptions.push(vscode.languages.registerDocumentHighlightProvider({ scheme: "file" }, highlightProvider))

    let inputBox = vscode.window.createInputBox()
    inputBox.prompt = "Log Condenser"
    inputBox.placeholder = "Condense: enter text or regular expression..."
    inputBox.ignoreFocusOut = true
    context.subscriptions.push(inputBox)

    function processUserInput(text: string) {
        if (state.document) {
            inputBox.validationMessage = ""
            try {
                if (text) {
                    new RegExp(text) // this is a validity check (throws when it's not a valid regular expression)
                    state.view = condenser(state.document, text)
                    if (!state.view.ranges.length) {
                        inputBox.validationMessage = "no matches"
                    }
                }
            } catch (e) {
                inputBox.validationMessage = "not a valid regular expression"
            }
            if (inputBox.validationMessage) {
                state.view = { ranges: [], highlights: [] }
            }
            foldingRangeProvider.onDidChangeEmitter.fire()
            vscode.commands.executeCommand(inputBox.validationMessage ? "editor.unfoldAll" : "editor.foldAll", {})
            vscode.commands.executeCommand("editor.action.wordHighlight.trigger", {})
        }
        return !inputBox.validationMessage
    }

    let throttle = new (class implements vscode.Disposable {
        timer: NodeJS.Timeout | undefined
        dispose() {
            if (this.timer) {
                clearTimeout(this.timer)
                this.timer = undefined
            }
        }
    })()
    context.subscriptions.push(throttle)

    function closeInputBox() {
        throttle.dispose()
        inputBox.hide()
        state.view = { ranges: [], highlights: [] }
        if (state.document) {
            foldingRangeProvider.onDidChangeEmitter.fire()
            vscode.commands.executeCommand("editor.unfoldAll", {})
        }
        state.document = undefined
        vscode.commands.executeCommand("setContext", "condenser.active", false)
    }

    context.subscriptions.push(
        vscode.commands.registerCommand("condenser.start", async () => {
            const editor = vscode.window.activeTextEditor
            if (editor) {
                state.document = editor.document
                let selection = editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end))
                inputBox.value = selection || ""
                if (inputBox.value) {
                    processUserInput(inputBox.value)
                }
                state.accepted = false
                state.histPos = -1
                inputBox.show()
                vscode.commands.executeCommand("setContext", "condenser.active", true)
                vscode.commands.executeCommand("setContext", "condenser.inputBox", true)
            }
        }),

        // ***** Input Box Events ***** //

        inputBox.onDidChangeValue(async (text) => {
            // User is editing the input box's contents
            throttle.dispose()
            throttle.timer = setTimeout(() => {
                processUserInput(text)
            }, LIVE_INPUT_UPDATE_DELAY)
        }),

        inputBox.onDidAccept(async () => {
            // User pressed ENTER
            throttle.dispose()
            let text = inputBox.value
            if (text.length) {
                if (processUserInput(text)) {
                    // this input value is valid - save the entered value for future reference
                    if (!state.histData[0]) {
                        state.histData[0] = text // no prior history - replace the zero-element
                    } else if (state.histData[0] !== text) {
                        state.histData.splice(0, 0, text) // push history back
                    }
                }
            } else {
                // treat pressing ENTER on an empty empty the same as cliking the close button
                closeInputBox()
            }
            state.accepted = true
            inputBox.hide() // this triggers onDidHide()
        }),

        inputBox.onDidHide(() => {
            // User pressed ESC
            inputBox.validationMessage = ""
            vscode.commands.executeCommand("setContext", "condenser.inputBox", false)
            !state.accepted && vscode.commands.executeCommand("editor.unfoldAll", {})
        }),

        // ***** Input Box History ***** //

        vscode.commands.registerCommand("condenser.prev", async () => {
            if (++state.histPos >= state.histData.length) {
                state.histPos = state.histData.length - 1
            }
            inputBox.value = state.histData[state.histPos]
            processUserInput(inputBox.value)
        }),
        vscode.commands.registerCommand("condenser.next", async () => {
            if (--state.histPos < 0) {
                state.histPos = -1
                inputBox.value = ""
            } else {
                inputBox.value = state.histData[state.histPos]
            }
            processUserInput(inputBox.value)
        }),

        // ***** Editor Title Buttons ***** //

        vscode.commands.registerCommand("condenser.collapse.all", async () => {
            vscode.commands.executeCommand("editor.foldAll", {})
        }),
        vscode.commands.registerCommand("condenser.expand.all", async () => {
            vscode.commands.executeCommand("editor.unfoldAll", {})
        }),
        vscode.commands.registerCommand("condenser.stop", async () => {
            closeInputBox()
        })
    )
}

export function deactivate() {}
