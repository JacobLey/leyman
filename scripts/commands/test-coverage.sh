#!/usr/bin/env bash

function test_coverage() {
    nx run-many -t test
    rm -rf ./.coverage/tmp
    mkdir -p ./.coverage/tmp
    cp -r ./.coverage/project/*/tmp/*/* ./.coverage/project/@*/*/tmp/*/* ./.coverage/tmp
    nx run-many -t coverage-report
}