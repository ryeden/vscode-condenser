import * as vscode from "vscode"
import condenser from "./condenser"

const INPUT_UPDATE_DELAY = 300 // in msec
const HISTORY_UPDATE_DELAY = 600// in msec

function log(text: string) {
    // Uncomment this to enable logging
    // console.log(`condenser[${new Date().toJSON()}]: ${text}`)
}

class State {

    document: vscode.TextDocument
    fsPath: string // used as an object id
    filter: string = ""
    error: string = ""
    view?: { ranges?: vscode.FoldingRange[], highlights?: vscode.DocumentHighlight[], matches?: number, error?: string }

    histData = [""]
    histPos = -1

    timer?: NodeJS.Timeout
    pending?: (...args: any[]) => any
    busy: boolean = false
    abort: boolean = false

    constructor(document: vscode.TextDocument) {
        this.document = document
        this.fsPath = this.document.uri.fsPath
        log(`${this.fsPath}: state created`)
    }
    dispose() {
        this.stop()
        log(`${this.fsPath}: state disposed`)
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = undefined
        }
        this.abort = true
        this.pending = undefined
    }
    schedule(callback: (...args: any[]) => any, delay?: number) {
        log(`${this.fsPath}: schedule a scan`)
        this.stop()
        this.pending = callback // this replaces an earlier saved callback, if any
        this.timer = setTimeout(() => {
            log(`${this.fsPath}: run a scheduled scan`)
            if (this.pending) {
                this.pending()
                this.pending = undefined
            }
        }, typeof delay === "undefined" ? INPUT_UPDATE_DELAY : delay)
    }

}

class Store extends vscode.Disposable {

    data: { [key: string]: State } = {}

    constructor() {
        super(() => this.dispose())
        log(`Store created`)
    }
    dispose() {
        for (const key in this.data) {
            this.data[key].dispose()
        }
        this.data = {}
        log(`Store disposed`)
    }

    add = (key: string, state: State) => {
        this.data[key] = state
        return state
    }
    get = (key: string) => this.data[key]
    del = (key: string) => {
        this.data[key].dispose()
        delete this.data[key]
    }

    getActives() {
        return Object.keys(this.data).filter((key) => Boolean(this.data[key].view?.ranges?.length))
    }
}


export function activate(context: vscode.ExtensionContext) {

    let inputBox = vscode.window.createInputBox()
    inputBox.prompt = "Log Condenser"
    inputBox.placeholder = "Condense: enter text or regular expression..."
    context.subscriptions.push(inputBox)

    let store = new Store()
    context.subscriptions.push(store)

    // ***** Register Handlers ***** //

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            store.del(document.uri.fsPath)
            vscode.commands.executeCommand("setContext", "condense.active", store.getActives())
        })
    )

    let foldingRangeProvider = new (class implements vscode.FoldingRangeProvider {
        provideFoldingRanges(document: vscode.TextDocument) {
            // NOTE: the documentation fails to mention that returning a null / undefined does not affect the
            // previously provided ranges; returning an empty array [] is required to actually remove them
            const state = store.get(document.uri.fsPath)
            return state && state.view?.ranges || []
        }
        onDidChangeEmitter = new vscode.EventEmitter<void>()
        onDidChangeFoldingRanges = this.onDidChangeEmitter.event
    })()
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider({ scheme: "file" }, foldingRangeProvider))
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider({ scheme: "untitled" }, foldingRangeProvider))

    let highlightProvider = new (class implements vscode.DocumentHighlightProvider {
        provideDocumentHighlights(document: vscode.TextDocument) {
            const state = store.get(document.uri.fsPath)
            return state && state.view?.highlights || []
        }
    })()
    context.subscriptions.push(vscode.languages.registerDocumentHighlightProvider({ scheme: "file" }, highlightProvider))

    // ***** Utilities ***** //

    function getState() {
        const editor = vscode.window.activeTextEditor
        return editor && store.get(editor.document.uri.fsPath)
    }

    function condenserStop() {
        inputBox.hide()
        const state = getState()
        if (state) {
            state.stop()
            state.view = undefined // this makes condensing inactive for the current editor
            foldingRangeProvider.onDidChangeEmitter.fire()
            vscode.commands.executeCommand("setContext", "condense.active", store.getActives())
        }
    }

    // ***** Register Commands ***** //

    context.subscriptions.push(

        // this command is used internally, i.e. it's not exposed as "contributes" in package.json
        vscode.commands.registerCommand("condense.analyze", async (state: State, filter: string) => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                // title: we don't set it here, because doing so will result in progress dialogs popping up immediately, i.e. even for short searches
                cancellable: true
            }, async (progress, token) => {
                return new Promise<void>(async (resolve, reject) => {

                    if (!state.busy) {
                        state.busy = true
                        state.abort = false

                        if (state.filter !== filter) {
                            let error = ""
                            if (!filter) {
                                state.view = undefined
                            } else {
                                try {
                                    new RegExp(filter); // this is a validity check
                                } catch (e) {
                                    error = "not a valid regular expression"
                                }
                                if (!error) {
                                    log(`${state.fsPath}: analyze: started: [${filter}] ...`)

                                    let scanned = 0
                                    state.view = await condenser(state.document, filter,
                                        (line: number, lines: number, matches: number) => {
                                            progress.report({ message: `line ${line} - ${matches} matches found`, increment: 100 * (line - scanned) / lines })
                                            scanned = line
                                            return state.abort || token.isCancellationRequested
                                        })
                                    state.abort = false
                                    log(`${state.fsPath}: analyze: ${state.view.error || "completed"}`)

                                    if (token.isCancellationRequested) {
                                        state.stop() // the user clicked on cancel - stop a possibly pending run too
                                    }
                                    error = state.view.error || !state.view.matches && "no matches" || ""
                                }
                                if (error) {
                                    state.view = undefined
                                }
                            }
                            // this is an atomic state update
                            state.filter = filter
                            state.error = error
                        }
                        log(`${state.fsPath}: analyze: filter=[${state.filter}] error=[${state.error}] matches=${state.view?.matches || 0} ranges=${state.view?.ranges?.length || 0} highlights=${state.view?.highlights?.length || 0} `)

                        state.busy = false

                        if (state.timer && state.pending) {
                            log(`${state.fsPath}: analyze: expedite next pending scan`)
                            state.schedule(state.pending, 0)
                        }

                    } else {
                        log(`${state.fsPath}: analyze: busy - request rescheduled`)
                        state.schedule(() => vscode.commands.executeCommand("condense.analyze", state, filter))
                    }
                    resolve()
                })
                    .then(() => {
                        log(`${state.fsPath}: analyze: window refresh`)
                        inputBox.validationMessage = state.pending ? "" : state.error // don't show an error when we know another scan is coming
                        foldingRangeProvider.onDidChangeEmitter.fire()
                        vscode.commands.executeCommand(state.error ? "editor.unfoldAll" : "editor.foldAll", {})
                        vscode.commands.executeCommand("editor.action.wordHighlight.trigger", {})
                        vscode.commands.executeCommand("setContext", "condense.active", store.getActives())
                    })
            })
        }),

        vscode.commands.registerCommand("condense.start", async () => {
            const editor = vscode.window.activeTextEditor
            if (editor) {
                const document = editor.document
                const key = document.uri.fsPath
                const state = store.get(key) || store.add(key, new State(document))
                state.histPos = -1

                inputBox.value = document.getText(new vscode.Range(editor.selection.start, editor.selection.end)) || state.filter
                inputBox.validationMessage = ""
                inputBox.show()

                vscode.commands.executeCommand("setContext", "condense.inputFocus", true)
                vscode.commands.executeCommand("condense.analyze", state, inputBox.value)
            }
        }),

        // ***** Input Box Events ***** //

        inputBox.onDidChangeValue(async (text) => {
            // User changed the input box's value
            const state = getState()
            state?.schedule(() => vscode.commands.executeCommand("condense.analyze", state, text))
        }),

        inputBox.onDidAccept(async () => {
            // User pressed ENTER
            const state = getState()
            if (!inputBox.value || !state) {
                condenserStop() // treat pressing ENTER on an empty input box the same as cliking the close button
            } else {
                state.stop()
                if (state.filter !== inputBox.value) {
                    vscode.commands.executeCommand("condense.analyze", state, inputBox.value)
                }
                // save the entered value for future reference
                if (!state.histData[0]) {
                    state.histData[0] = state.filter // no prior history - replace the zero-element
                } else if (state.histData[0] !== state.filter) {
                    state.histData.splice(0, 0, state.filter) // push history back
                }
            }
            inputBox.hide() // this triggers onDidHide()
        }),

        inputBox.onDidHide(() => {
            // User pressed ENTER, pressed ESC or clicked away
            inputBox.validationMessage = ""
            vscode.commands.executeCommand("setContext", "condense.inputFocus", false)
        }),

        // ***** Input Box History ***** //

        vscode.commands.registerCommand("condense.prev", async () => {
            const state = getState()
            if (state) {
                if (++state.histPos >= state.histData.length) {
                    state.histPos = state.histData.length - 1
                }
                inputBox.value = state.histData[state.histPos]
                if (state.filter !== inputBox.value) {
                    state.schedule(() => vscode.commands.executeCommand("condense.analyze", state, inputBox.value), HISTORY_UPDATE_DELAY)
                }
            }
        }),
        vscode.commands.registerCommand("condense.next", async () => {
            const state = getState()
            if (state) {
                if (--state.histPos < 0) {
                    state.histPos = -1
                    inputBox.value = ""
                } else {
                    inputBox.value = state.histData[state.histPos]
                }
                if (state.filter !== inputBox.value) {
                    state.schedule(() => vscode.commands.executeCommand("condense.analyze", state, inputBox.value), HISTORY_UPDATE_DELAY)
                }
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

    log(`activated`)
}

export function deactivate() {
    log(`deactivated`)
}
