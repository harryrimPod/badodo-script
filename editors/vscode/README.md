# Badodo Script VS Code support

This source extension provides `.bds` language registration, keyword completion,
and builtin hover documentation without pulling the compiler into the VS Code
host. For project diagnostics and full semantic completion, install the CLI and
configure an LSP client to run `bds-lsp`:

```bash
npm install --global badodo-script
```

The protocol server implements `initialize`, document open/change diagnostics,
completion, hover, shutdown, and exit over standard LSP framing.
