import { commands, window, Disposable, DocumentHighlight, FoldingRange, InputBox, QuickInputButton, TextDocument } from "vscode"

const INPUT_UPDATE_DELAY = 300 // in msec
const HISTORY_UPDATE_DELAY = 600 // in msec

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function log(text: string) {
    // console.log(`condenser[${new Date().toJSON()}]: state: ${text}`)
}

export type View = { ranges?: FoldingRange[]; highlights?: DocumentHighlight[]; matches?: number; error?: string }

export class Button {
    constructor(public icon: QuickInputButton, public action: string) {}
}

export class State extends Disposable {
    id: string // this is fsPath of the current document

    inputBox: InputBox
    filter = ""
    error = ""
    view?: View

    histData = [""]
    histPos = -1

    timer?: NodeJS.Timeout
    pending?: (...args: unknown[]) => unknown
    busy = false
    abort = false

    disposables: Disposable[] = []

    constructor(public document: TextDocument, public buttons: Button[], public refresh: () => void) {
        super(() => this.dispose())
        this.id = document.uri.fsPath

        this.inputBox = window.createInputBox()
        this.inputBox.title = `Condense: ${document.uri.path}`
        this.inputBox.placeholder = "Enter text or regular expression..."
        this.inputBox.buttons = buttons.map((btn) => btn.icon)
        this.inputBox.ignoreFocusOut = true

        this.disposables.push(
            this.inputBox,

            this.inputBox.onDidChangeValue(async (text) => {
                // User changed the input box's value
                this.schedule(() => commands.executeCommand("condense.analyze", this, text))
            }),

            this.inputBox.onDidAccept(async () => {
                // User pressed ENTER
                if (!this.inputBox.value) {
                    this.setInactiveState()
                } else {
                    this.stop()
                    if (this.filter !== this.inputBox.value) {
                        commands.executeCommand("condense.analyze", this, this.inputBox.value)
                    }
                    // save the entered value for future reference
                    if (!this.histData[0]) {
                        this.histData[0] = this.filter // no prior history - replace the zero-element
                    } else if (this.histData[0] !== this.filter) {
                        this.histData.splice(0, 0, this.filter) // push history back
                    }
                }
                this.inputBox.hide() // this triggers onDidHide()
            }),

            this.inputBox.onDidHide(() => {
                // User pressed ENTER, pressed ESC or clicked away
                this.inputBox.validationMessage = ""
                commands.executeCommand("setContext", "condense.inputFocus", false)
            }),

            this.inputBox.onDidTriggerButton((item) => {
                const btn = this.buttons.find((btn) => item === btn.icon)
                btn && commands.executeCommand(btn.action, {})
            })
        )

        log(`${this.id}: created`)
    }

    setActiveState(value?: string): void {
        // condenser is active, input box is focused
        this.histPos = -1
        this.inputBox.value = value || this.filter
        this.inputBox.show()
        commands.executeCommand("setContext", "condense.inputFocus", true)
        commands.executeCommand("condense.analyze", this, this.inputBox.value)
    }

    setInactiveState(): void {
        // condenser is inactive, input box is not focused, history is preserved
        this.inputBox.hide()
        this.view = undefined
        this.filter = ""
        this.stop()
        this.refresh() // redraw the editor's contents
    }

    closeDialog(): void {
        // close the input box, but keep the condenser's current state (active or inactive)
        this.inputBox.hide()
    }

    historyPrev(): void {
        if (++this.histPos >= this.histData.length) {
            this.histPos = this.histData.length - 1
        }
        this.inputBox.value = this.histData[this.histPos]
        if (this.filter !== this.inputBox.value) {
            this.schedule(() => commands.executeCommand("condense.analyze", this, this.inputBox.value), HISTORY_UPDATE_DELAY)
        }
    }

    historyNext(): void {
        if (--this.histPos < 0) {
            this.histPos = -1
            this.inputBox.value = ""
        } else {
            this.inputBox.value = this.histData[this.histPos]
        }
        if (this.filter !== this.inputBox.value) {
            this.schedule(() => commands.executeCommand("condense.analyze", this, this.inputBox.value), HISTORY_UPDATE_DELAY)
        }
    }

    schedule(callback: (...args: unknown[]) => unknown, delay?: number): void {
        log(`${this.id}: schedule a scan`)
        this.stop()
        this.pending = callback // this replaces an earlier saved callback, if any
        this.timer = setTimeout(
            () => {
                log(`${this.id}: run a scheduled scan`)
                if (this.pending) {
                    this.pending()
                    this.pending = undefined
                }
            },
            typeof delay === "undefined" ? INPUT_UPDATE_DELAY : delay
        )
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = undefined
        }
        this.abort = true
        this.pending = undefined
    }

    dispose(): void {
        this.stop()
        this.disposables.forEach((d) => d.dispose())
        log(`${this.id}: disposed`)
    }
}
