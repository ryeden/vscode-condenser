# Log Condenser

This extension lets you view files through a filter specified with a *text string* or a *regular expression*. Hidden lines that don't match the filter can be easily revealed.

This tool is intended primary as a *log viewer* to make browsing through large files manageable and more convenient.

## Usage

### How to Activate

- Open a file and start **Log Condenser** with `Ctrl+'` (`Cmd+'`), or...
- Open a file and start **Log Condenser** with `Ctrl-Shift-P` (`Cmd-Shift-P`) then enter "`Condense start`"

> *Editor toolbar* now shows an *input box* and buttons ![Condense expand](./resources/expand-all.png) (expand), ![Condense collapse](./resources/collapse-all.png) (collapse), and ![Condense stop](./resources/stop.png) (stop).

### How to Set Filter

- Once in **Condenser**'s input box, start typing to see the file's contents collapse, or...
- Select text inside editor, then [activate](#How-to-Activate) **Condenser** to see the selected text applied as a filter automatically
- Use `Up` / `Down` keys to browse through history in the input box

### How to Control Folding

- Click a *folding icon* (on the gutter between line numbers and line start) to hide reveal filtered text
- Click ![Condense expand](./resources/expand-all.png) button to unfold the entire file
- Click ![Condense collapse](./resources/collapse-all.png) button to fold the entire file

### How to Deactivate

- Click ![Condense stop](./resources/stop.png) (close) button in the editor toolbar, or...
- In **Condenser**'s input box, clear the text and press `Enter`

## Releases

Current release is **0.1.0**

Information about prior releases can be found in [CHANGELOG](./CHANGELOG.md).
