import {
    commands,
    languages,
    window,
    workspace,
    Disposable,
    DocumentHighlightProvider,
    EventEmitter,
    ExtensionContext,
    FoldingRangeProvider,
    ProgressLocation,
    Range,
    TextDocument,
    Uri,
} from "vscode"

import { State, Button } from "./state"
import analyze from "./analyze"

const buttonsConfig = [
    {
        dark: "resources/dark/expand-all.png",
        light: "resources/light/expand-all.png",
        tooltip: "Expand all",
        action: "editor.unfoldAll",
    },
    {
        dark: "resources/dark/collapse-all.png",
        light: "resources/light/collapse-all.png",
        tooltip: "Collapse all",
        action: "editor.foldAll",
    },
    {
        dark: "resources/dark/stop.png",
        light: "resources/light/stop.png",
        tooltip: "Stop condensing",
        action: "condense.stop",
    },
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function log(text: string) {
    // console.log(`condenser[${new Date().toJSON()}]: extension: ${text}`)
}

class Store extends Disposable {
    data: { [id: string]: State } = {}

    constructor() {
        super(() => this.dispose())
        log(`Store created`)
    }
    dispose() {
        this.getAll().forEach((d) => d.dispose())
        this.data = {}
        log(`Store disposed`)
    }

    add = (id: string, state: State) => {
        this.data[id] = state
        return state
    }
    get = (id: string) => this.data[id]
    getAll = () => Object.keys(this.data).map((id) => this.data[id])
    del = (id: string) => {
        this.data[id]?.dispose()
        delete this.data[id]
    }
}

export async function activate(context: ExtensionContext): Promise<void> {
    const buttons = buttonsConfig.map(
        (cfg) =>
            new Button(
                {
                    iconPath: {
                        dark: Uri.file(context.asAbsolutePath(cfg.dark)),
                        light: Uri.file(context.asAbsolutePath(cfg.light)),
                    },
                    tooltip: cfg.tooltip,
                },
                cfg.action
            )
    )

    const store = new Store()
    context.subscriptions.push(store)

    function getState() {
        const editor = window.activeTextEditor
        return editor && store.get(editor.document.uri.fsPath)
    }

    // ***** Register Handlers ***** //

    const foldingRangeProvider = new (class implements FoldingRangeProvider {
        provideFoldingRanges(document: TextDocument) {
            // NOTE: the documentation fails to mention that returning a null / undefined does not affect the
            // previously provided ranges; returning an empty array [] is required to actually remove them
            const state = store.get(document.uri.fsPath)
            return (state && state.view?.ranges) || []
        }
        onDidChangeEmitter = new EventEmitter<void>()
        onDidChangeFoldingRanges = this.onDidChangeEmitter.event
    })()
    context.subscriptions.push(
        languages.registerFoldingRangeProvider([{ scheme: "file" }, { scheme: "untitled" }], foldingRangeProvider)
    )

    const highlightProvider = new (class implements DocumentHighlightProvider {
        provideDocumentHighlights(document: TextDocument) {
            const state = store.get(document.uri.fsPath)
            return (state && state.view?.highlights) || []
        }
    })()
    context.subscriptions.push(
        languages.registerDocumentHighlightProvider([{ scheme: "file" }, { scheme: "untitled" }], highlightProvider)
    )

    context.subscriptions.push(
        window.onDidChangeActiveTextEditor(() => {
            store.getAll().forEach((state) => state.closeDialog())
        })
    )

    context.subscriptions.push(
        workspace.onDidCloseTextDocument((document) => {
            const state = store.get(document.uri.fsPath)
            state && state.setInactiveState()
            store.del(document.uri.fsPath)
        })
    )

    // ***** Register Commands ***** //

    context.subscriptions.push(
        commands.registerCommand("condense.start", async () => {
            const editor = window.activeTextEditor
            if (editor) {
                const document = editor.document
                const id = document.uri.fsPath
                const state =
                    store.get(id) ||
                    store.add(
                        id,
                        new State(document, buttons, () => {
                            foldingRangeProvider.onDidChangeEmitter.fire()
                        })
                    )
                state.setActiveState(document.getText(new Range(editor.selection.start, editor.selection.end)))
            }
        }),

        commands.registerCommand("condense.stop", async () => {
            const state = getState()
            state && state.setInactiveState()
            foldingRangeProvider.onDidChangeEmitter.fire()
            commands.executeCommand("editor.unfoldAll", {})
            commands.executeCommand("editor.action.wordHighlight.trigger", {})
        }),

        commands.registerCommand("condense.prev", async () => {
            const state = getState()
            state && state.historyPrev()
        }),

        commands.registerCommand("condense.next", async () => {
            const state = getState()
            state && state.historyNext()
        }),

        // this command is used internally, i.e. it's not exposed as "contributes" in package.json
        commands.registerCommand("condense.analyze", async (state: State, filter: string) => {
            window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    // title: we don't set it here, because doing so will result in progress dialogs popping up immediately, i.e. even for short searches
                    cancellable: true,
                },
                async (progress, token) => {
                    if (state.busy) {
                        log(`${state.id}: busy - request rescheduled`)
                        state.schedule(() => commands.executeCommand("condense.analyze", state, filter))
                    } else if (state.filter !== filter) {
                        return analyze(progress, token, state, filter).then(() => {
                            if (state.timer && state.pending) {
                                log(`${state.id}: expedite next pending scan`)
                                state.schedule(state.pending, 0)
                            }
                            log(`${state.id}: window refresh`)
                            state.inputBox.validationMessage = state.pending ? "" : state.error // don't show an error when we know another scan is coming
                            foldingRangeProvider.onDidChangeEmitter.fire()
                            commands.executeCommand(state.error ? "editor.unfoldAll" : "editor.foldAll", {})
                            commands.executeCommand("editor.action.wordHighlight.trigger", {})
                        })
                    }
                }
            )
        })
    )

    commands.executeCommand("setContext", "condense.loaded", {})
    log(`loaded`)
}

export function deactivate(): void {
    log(`deactivated`)
}
