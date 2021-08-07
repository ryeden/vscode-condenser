import * as vscode from "vscode"
import condenser from "./condenser"

const LIVE_INPUT_UPDATE_DELAY = 200 // in msec

class State {
    filter: string = ""
    histData = [""]
    histPos = -1
    view:
        | undefined
        | {
            ranges: vscode.FoldingRange[]
            highlights: vscode.DocumentHighlight[]
        }
}

export function activate(context: vscode.ExtensionContext) {
    let store: { [key: string]: State } = {}

    function getContext() {
        const editor = vscode.window.activeTextEditor
        if (editor) {
            const document = editor.document
            const state = store[document.uri.fsPath]
            if (state) {
                return { document, state }
            }
        }
        return {}
    }
    function getActiveList() {
        return Object.keys(store).filter(key => store[key] && typeof store[key].view !== "undefined")
    }

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            delete store[document.uri.fsPath]
            vscode.commands.executeCommand("setContext", "condense.active", getActiveList())
        })
    )

    let foldingRangeProvider = new (class implements vscode.FoldingRangeProvider {
        provideFoldingRanges(document: vscode.TextDocument) {
            // NOTE: the documentation fails to mention that returning a null / undefined does not affect
            // the previously provided ranges; we need to return an empty array [] to actually remove them
            const state = store[document.uri.fsPath]
            return state && state.view && state.view.ranges || []
        }
        onDidChangeEmitter = new vscode.EventEmitter<void>()
        onDidChangeFoldingRanges = this.onDidChangeEmitter.event
    })()
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider({ scheme: "file" }, foldingRangeProvider))
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider({ scheme: "untitled" }, foldingRangeProvider))

    let highlightProvider = new (class implements vscode.DocumentHighlightProvider {
        provideDocumentHighlights(document: vscode.TextDocument) {
            const state = store[document.uri.fsPath]
            return state && state.view && state.view.highlights
        }
    })()
    context.subscriptions.push(vscode.languages.registerDocumentHighlightProvider({ scheme: "file" }, highlightProvider))

    let inputBox = vscode.window.createInputBox()
    inputBox.prompt = "Log Condenser"
    inputBox.placeholder = "Condense: enter text or regular expression..."
    context.subscriptions.push(inputBox)

    function processUserInput(document: vscode.TextDocument, state: State) {
        inputBox.validationMessage = ""
        state.view = { ranges: [], highlights: [] }
        if (state.filter) {
            try {
                new RegExp(state.filter) // this is a validity check (throws when it's not a valid regular expression)
                state.view = condenser(document, state.filter)
                if (!state.view.highlights.length) {
                    inputBox.validationMessage = "no matches"
                    state.view = { ranges: [], highlights: [] }
                }
            } catch (e) {
                inputBox.validationMessage = "not a valid regular expression"
            }
        }
        foldingRangeProvider.onDidChangeEmitter.fire()
        vscode.commands.executeCommand(inputBox.validationMessage ? "editor.unfoldAll" : "editor.foldAll", {})
        vscode.commands.executeCommand("editor.action.wordHighlight.trigger", {})
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

    function condenserStop() {
        throttle.dispose()
        inputBox.hide()
        const { document, state } = getContext()
        if (document && state) {
            state.view = undefined
            foldingRangeProvider.onDidChangeEmitter.fire()
            vscode.commands.executeCommand("setContext", "condense.active", getActiveList())
        }
    }

    context.subscriptions.push(
        vscode.commands.registerCommand("condense.start", async () => {
            const editor = vscode.window.activeTextEditor
            if (editor) {
                const document = editor.document
                if (!store[document.uri.fsPath]) {
                    store[document.uri.fsPath] = new State()
                }
                const state = store[document.uri.fsPath]
                state.histPos = -1
                state.filter = document.getText(new vscode.Range(editor.selection.start, editor.selection.end))
                if (state.filter) {
                    processUserInput(document, state)
                }
                inputBox.value = state.filter
                inputBox.show()

                foldingRangeProvider.onDidChangeEmitter.fire()
                vscode.commands.executeCommand("editor.action.wordHighlight.trigger", {})
                vscode.commands.executeCommand("setContext", "condense.inputFocus", true)
                vscode.commands.executeCommand("setContext", "condense.active", getActiveList())
            }
        }),

        // ***** Input Box Events ***** //

        inputBox.onDidChangeValue(async (text) => {
            // User is editing the input box's contents
            throttle.dispose()
            throttle.timer = setTimeout(() => {
                const { document, state } = getContext()
                if (document && state) {
                    state.filter = text
                    processUserInput(document, state)
                }
            }, LIVE_INPUT_UPDATE_DELAY)
        }),

        inputBox.onDidAccept(async () => {
            // User pressed ENTER
            throttle.dispose()
            let text = inputBox.value
            if (text.length) {
                const { document, state } = getContext()
                if (document && state) {
                    state.filter = text
                    if (processUserInput(document, state)) {
                        // this input value is valid - save the entered value for future reference
                        if (!state.histData[0]) {
                            state.histData[0] = text // no prior history - replace the zero-element
                        } else if (state.histData[0] !== text) {
                            state.histData.splice(0, 0, text) // push history back
                        }
                    }
                }
            } else {
                // treat pressing ENTER on an empty empty the same as cliking the close button
                condenserStop()
            }
            inputBox.hide() // this triggers onDidHide()
        }),

        inputBox.onDidHide(() => {
            // User pressed ESC
            inputBox.validationMessage = ""
            vscode.commands.executeCommand("setContext", "condense.inputFocus", false)
        }),

        // ***** Input Box History ***** //

        vscode.commands.registerCommand("condense.prev", async () => {
            const { document, state } = getContext()
            if (document && state) {
                if (++state.histPos >= state.histData.length) {
                    state.histPos = state.histData.length - 1
                }
                inputBox.value = state.filter = state.histData[state.histPos]
                processUserInput(document, state)
            }
        }),
        vscode.commands.registerCommand("condense.next", async () => {
            const { document, state } = getContext()
            if (document && state) {
                if (--state.histPos < 0) {
                    state.histPos = -1
                    inputBox.value = state.filter = ""
                } else {
                    inputBox.value = state.filter = state.histData[state.histPos]
                }
                processUserInput(document, state)
            }
        }),

        // ***** Editor Title Buttons ***** //

        vscode.commands.registerCommand("condense.collapse.all", async () => {
            vscode.commands.executeCommand("editor.foldAll", {})
        }),
        vscode.commands.registerCommand("condense.expand.all", async () => {
            vscode.commands.executeCommand("editor.unfoldAll", {})
        }),
        vscode.commands.registerCommand("condense.stop", async () => {
            condenserStop()
        })
    )

    console.log(`condenser: activated`)
}

export function deactivate() { }
