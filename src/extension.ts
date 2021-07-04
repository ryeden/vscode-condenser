import * as vscode from "vscode"
import condenser from "./condenser"

export function activate(context: vscode.ExtensionContext) {
    let state: {
        filter: string
        ranges: vscode.FoldingRange[]
        highlights: vscode.DocumentHighlight[]
    } = {
        filter: "",
        ranges: [],
        highlights: [],
    }

    context.subscriptions.push(
        vscode.commands.registerCommand("condenser.start", async () => {
            let editor = vscode.window.activeTextEditor
            if (!editor) {
                return
            }
            vscode.commands.executeCommand("setContext", "condenser.showMenu", true)

            const filter = await vscode.window.showInputBox({
                value: state.filter,
                placeHolder: "enter a text string or a regular expression...",
                validateInput: (text) => {
                    try {
                        new RegExp(text)
                    } catch (e) {
                        return "not a valid regular expression"
                    }
                },
            })
            if (filter) {
                let [ranges, highlights] = condenser(editor.document, filter)
                state = { filter: filter, ranges: ranges, highlights: highlights }
                foldingRangeProvider.onDidChangeEmitter.fire()
                vscode.commands.executeCommand("editor.foldAll", {})
            } else {
                state = { filter: "", ranges: [], highlights: [] }
                foldingRangeProvider.onDidChangeEmitter.fire()
                vscode.commands.executeCommand("setContext", "condenser.showMenu", false)
            }
        }),

        vscode.commands.registerCommand("condenser.collapse.all", async () => {
            vscode.commands.executeCommand("editor.foldAll", {})
        }),

        vscode.commands.registerCommand("condenser.expand.all", async () => {
            vscode.commands.executeCommand("editor.unfoldAll", {})
        }),

        vscode.commands.registerCommand("condenser.stop", async () => {
            state = { filter: "", ranges: [], highlights: [] }
            foldingRangeProvider.onDidChangeEmitter.fire()
            vscode.commands.executeCommand("setContext", "condenser.showMenu", false)
        })
    )

    let foldingRangeProvider = new (class implements vscode.FoldingRangeProvider {
        provideFoldingRanges(document: vscode.TextDocument) {
            return state.ranges
        }
        onDidChangeEmitter = new vscode.EventEmitter<void>()
        onDidChangeFoldingRanges = this.onDidChangeEmitter.event
    })()
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider({ scheme: "file" }, foldingRangeProvider))

    let highlightProvider = new (class implements vscode.DocumentHighlightProvider {
        provideDocumentHighlights(document: vscode.TextDocument) {
            return state.highlights
        }
    })()
    context.subscriptions.push(vscode.languages.registerDocumentHighlightProvider({ scheme: "file" }, highlightProvider))
}

export function deactivate() {}
