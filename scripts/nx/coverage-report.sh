#!/usr/bin/env bash

set -e

PROJECT=$NX_TASK_TARGET_PROJECT
WORKSPACE_ROOT=$NX_WORKSPACE_ROOT

# Create project-specific tmp dir for coverage merging
COVERAGE_TMP="$WORKSPACE_ROOT/.coverage/project/$PROJECT/report-tmp"
rm -rf "$COVERAGE_TMP"
mkdir -p "$COVERAGE_TMP"

# Get the project and all transitive dependents (projects that depend on this project)
# from nx graph - those are the sources of coverage data for this project's files
DEPS=$(nx graph --print | node -e "
const graph = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).graph;
const project = '$PROJECT';

// Build reverse dependency map: target -> [sources that depend on it]
const reverseDeps = {};
for (const [source, edges] of Object.entries(graph.dependencies)) {
  for (const edge of edges) {
    (reverseDeps[edge.target] ??= []).push(source);
  }
}

const deps = new Set([project]);
const queue = [project];
while (queue.length) {
  const node = queue.shift();
  for (const dependent of (reverseDeps[node] || [])) {
    if (!deps.has(dependent)) {
      deps.add(dependent);
      queue.push(dependent);
    }
  }
}
console.log(Array.from(deps).join('\n'));
")

# Copy coverage tmp files for project and its transitive deps
while IFS= read -r dep; do
  dep_cov="$WORKSPACE_ROOT/.coverage/project/$dep/tmp"
  if [ -d "$dep_cov" ]; then
    find "$dep_cov" -maxdepth 2 -name "*.json" -exec cp {} "$COVERAGE_TMP/" \;
  fi
done <<< "$DEPS"

c8 --temp-directory="$COVERAGE_TMP" -o "$WORKSPACE_ROOT/.coverage/project/$PROJECT/report" -c "$WORKSPACE_ROOT/configs/c8rc.json" report --all --check-coverage --merge-async
