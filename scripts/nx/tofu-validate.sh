#!/usr/bin/env bash

set -e

# Validates without credentials or state: `-backend=false` skips the remote state, so CI on a pull request can run it.
# The providers come from the committed lock file only, never a newer release.
tofu init -backend=false -input=false -lockfile=readonly > /dev/null
tofu validate
