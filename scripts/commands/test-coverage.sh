#!/usr/bin/env bash

function test_coverage() {
    set -e
    nx run-many -t test --tuiAutoExit --nxBail
    rm -rf ./.coverage/tmp
    mkdir -p ./.coverage/tmp
    cp -r ./.coverage/project/*/tmp/*/* ./.coverage/project/@*/*/tmp/*/* ./.coverage/tmp
    nx run-many -t coverage-report --tuiAutoExit --nxBail
}