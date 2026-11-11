# Show available recipes.
default:
    @just --list

# Install dependencies reproducibly (frozen lockfile).
install:
    pnpm install --frozen-lockfile

# Run tests (node --test, no pi runtime required).
test:
    pnpm test

# Type-check without emitting files.
typecheck:
    pnpm run typecheck

# Verify package contents without publishing (pnpm pack --dry-run).
pack:
    pnpm run pack:check

# Everything a release needs: typecheck + tests + pack check.
check: typecheck test pack

# Bump version, commit, tag, and push commits/tags.
# Usage: just bump patch|minor|major
@bump type:
    pnpm version {{type}}
    git push --follow-tags

# Publish the current version to npm (run `just check` and `just bump` first).
@publish:
    pnpm publish --access public

# Start pi with this extension loaded for a manual try-out.
try:
    pi -e ./src/index.ts

# Install this checkout into pi as a local package.
install-local:
    pi install {{justfile_directory()}}
