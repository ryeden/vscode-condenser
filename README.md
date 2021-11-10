# Log Condenser

This extension lets you view files through a filter specified by a *text string* or a *regular expression*. Hidden lines that don't match the filter can be easily hidden or revealed.

This tool is intended primary as a *log viewer* to make browsing through large text files manageable and more convenient.

![Demo Video](resources/demo.gif)

## Usage

### How to Start Condensing

- When inside a text editor - press `Ctrl+'` (`⌘'`).
- Alternatively, press `Ctrl+Shift+P` (`⇧⌘P`), then enter "`Condense start`".

> **Condenser Dialog** box with buttons ![](resources/expand-all.png) (expand all), ![](resources/collapse-all.png) (collapse all), and ![](resources/stop.png) (stop condensing) is shown now at the text editor's top.

### How to Set a Filter

- Select some text inside an editor, then press `Ctrl+'` (`⌘'`); selected text is automatically applied as a filter.
- When in **Condenser Dialog** - type text and watch the editor's contents change.
- When in **Condenser Dialog** - use `Up` / `Down` keys to browse through history.
- Pressing `Enter` inside **Condenser Dialog** saves the current filter in history - pressing `Esc` does not.

### How to Hide and Reveal Text

- Clicking the *folding icon* on the gutter between a line's number and its text, hides or reveals folded text.
- Click on a line inside a text editor, then press `Ctrl+Shift+]` (`⌥⌘]`) to expand the fold under that line or, alternatively, press `Ctrl+Shift+[` (`⌥⌘[`) to collapse it.
- When in **Condenser Dialog** - click the ![](resources/expand-all.png) button to expand the entire file or the ![](resources/collapse-all.png) button to collapse it.

### How to Stop Condensing

- Press `Ctrl+Shift+'` (`⇧⌘'`).
- When in **Condenser Dialog** - click the ![](resources/stop.png) button or, alternatively, clear the text and then press `Enter`.
- Press `Ctrl+Shift+P` (`⇧⌘P`), then enter "`Condense stop`".

### Known Issues

- As **Log Condenser** does not check file types, folding may get confused when applied to structured content such as JSON, HTML, JavaScript etc, i.e. files for which folding is already provided by a language support package.
