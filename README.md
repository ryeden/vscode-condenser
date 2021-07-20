# Log Condenser

This extension lets you view files through a filter specified with a *text string* or a *regular expression*. Hidden lines that don't match the filter can be easily revealed.

This tool is intended primary as a *log viewer* to make browsing through large files manageable and more convenient.

![Demo Video](resources/demo.gif)

## Usage

### How to Start Condensing

- Open a file and start **Log Condenser** with `Ctrl+'` (`⌘'`), or...
- Open a file and start **Log Condenser** with `Ctrl+Shift+P` (`⇧⌘P`) then enter "`Condense start`"

> *Editor toolbar* now shows an *input box* and buttons ![Condense expand](resources/expand-all.png) (expand), ![Condense collapse](resources/collapse-all.png) (collapse), and ![Condense stop](resources/stop.png) (stop).

### How to Set Filter

- Once in **Condenser**'s input box, start typing to see the file's contents collapse, or...
- Select text inside editor, then [activate](#How-to-Activate) **Condenser** to see the selected text applied as a filter automatically
- Inside the **Condenser**'s input box use `Up` / `Down` keys to browse through history 
- Pressing `Enter` saves current filter in history, pressing `Esc` does not

### How to Navigate

- Click a *folding icon* (on the gutter between line numbers and line start) to hide / reveal filtered text
- Press `Ctrl+Shift+]` (`⌥⌘]`) to expand the fold under the cursor
- Press `Ctrl+Shift+[` (`⌥⌘[`) to collapse the fold under the cursor
- Click ![Condense expand](resources/expand-all.png) button to unfold the entire file
- Click ![Condense collapse](resources/collapse-all.png) button to fold the entire file

### How to Stop Condensing

- Click ![Condense stop](resources/stop.png) (close) button in the editor toolbar, or...
- In **Condenser**'s input box, clear the text and press `Enter`

### Known Issues

- As **Log Condenser** does not check file types, folding may get confused when applied on structured content such as in JSON, HTML, JS etc files (for which folding is already provided by a language support package)
