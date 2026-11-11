# Usage: just <task>. Run `just` to list tasks.

# List available tasks
default:
    @just --list

# Run unit tests (node --test, no pi required)
test:
    npm test

# Start pi with this extension loaded for a manual try-out
try:
    pi -e ./src/index.ts

# Install this checkout into pi as a local package
install-local:
    pi install {{justfile_directory()}}
