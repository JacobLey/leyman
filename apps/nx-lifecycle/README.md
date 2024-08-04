<div style="text-align:center">

# nx-lifecycle
An [Nx](https://nx.dev/) plugin that injects specific targets into high level workflows.

[![npm package](https://badge.fury.io/js/nx-lifecycle.svg)](https://www.npmjs.com/package/nx-lifecycle)
[![License](https://img.shields.io/npm/l/nx-lifecycle.svg)](https://github.com/JacobLey/leyman/blob/main/tools/nx-lifecycle/LICENSE)

</div>

## Table of Contents

- [Introduction](#introduction)
- [Usage](#usage)
- [API](#api)
    - [check](#check)
    - [dryRun](#dryrun)

## Introduction

Nx targets achieve a specific task, such as loading external config, codegen, type checking, formatting, test execution or enforcing code coverage. 

Some of these tasks depend on each other, others can be executed in parallel.

Nx uses the target's [dependsOn](https://nx.dev/reference/project-configuration#dependson) field to natively manage this, and will execute tasks whenever all dependencies are successfully complete.

In practice, this quickly becomes unweildy. In order to properly configure a given task, you have to have full context about all other tasks (including those of your dependencies). You also need to make sure all dependents are updated whenever you add another step to a task.

For example, perhaps your code contains a typescript build step [nx-tsc](https://www.npmjs.com/package/nx-tsc), followed by a unit test [mocha](https://mochajs.org/). An initial config will look like:

```json
{
    "targets": {
        "nx-tsc": {
            "dependsOn": ["^nx-tsc"]
        },
        "mocha": {
            "dependsOn": ["nx-tsc"]
        },
    }
}
```

Your mocha task depends on the nx-tsc first, and nx-tsc depends on any of _its_ dependencies to be built first.

Now what if you need want to add a step _after_ to your build? Perhaps you want to use your recently built JS code to [generate a JSON config](https://www.npmjs.com/package/nx-populate-files).

Now your mocha command needs to update to depend on that populate step, rather than `nx-tsc`. Your `nx-tsc` command _also_ needs to update its dependencies to depend on that task, rather than `nx-tsc`. But only if your dependencies include this populate step!

Instead of simply adding this new task, you now need to conditionally manage the dependecones on two other tasks! Imagine how this problem can grow as we begin to support more tasks like type checking, code coverage, or codegen. Each implemented slightly different in each package, especailly if you use more than one language in your monorepo!

`nx-lifecycle` is the solution to this problem, by breaking down the solution into two steps:

### High level tasks

We define abstract workflows that can optionally be used across any and all projects, regardless of language, purpose, or implementation.

An example would breaking up general steps around a build/compile step, a formatter/linter, and test execution/coverage. We can fairly safely say that the build step will depend on our dependencies build steps, and test execution will depend on our own projects build step.

Then we split up these high level tasks into even simpler tasks.
An example would be our test suite may contain both unit-tests and functional tests, and then a final step to enforce the resulting code coverage achieves acceptable levels.

Note these steps are still abstract, and it is not necessary that every project is capable of implementing every task.

### Bind implementions to tasks

Now we can bind project specific implementations to each abstract task.

In the original example, perhaps we bind our `nx-tsc` target to a `build:run` step, and our `nx-populate-files` step to a `build:post` step.

Then our `mocha` target can be bound to a `test:unit` step.

You can bind multiple targets to a single step. For example if your code also includes some Java projects, you might also bind your [@nx/gradle](https://nx.dev/nx-api/gradle]) target to `build:run`.

### Instrumenting your `nx.json` and `project.json`

Now that you configured your abstract tasks and bound implementations, `nx-lifecycle` will update your `nx.json` and relevant `project.json` files will all the `dependsOn` to make your code run efficiently and deterministically!

Any time you want to add or remove targets for a project, simply re-run `nx-lifecycle`'s plugin and all dependencies are up to date!

## Installation

`npm i nx-lifecycle`

Register it as a target in a `project.json`:
```json
{
    "targets": {
        "lifecycle": {
            "executor": "nx-lifecycle:lifecycle",
            "options": {
                "stages": {
                    "build": { 
                        "hooks": ["pre", "run", "post"], 
                        "dependsOn": ["^build"]
                    },
                    "test": {
                        "hooks": ["run", "report"],
                        "dependsOn": ["build"]
                    }
                },
                "bindings": {
                    "nx-tsc": "build:run",
                    "mocha": "test:run"
                }
            }
        }
    }
}
```

Note that this target only needs to be run once (not once per project) so it is recommended to put this somewhere like a root `project.json` to own this.

## Usage

Because the `lifecycle` executor manages target dependencies itself, it probably should not be executed along with targets that are normally executed, like the `build` and `test` targets in the example above.

For example, this project's use of `nx-lifecycle` is part of a [local-only project](https://github.com/JacobLey/leyman/blob/main/leyman/main/project.json#L15) that is never deployed anywhere, and exists only to manage the repo itself.

`nx-lifecycle` will produce additional targets in your `nx.json` and `project.json`s. These will all be backed by the [noop](https://nx.dev/nx-api/nx/executors/noop) executor, and have no need to invoke caching. In fact, you should never directly manage these commands, their dependencies, or their configurations.

You may declare one-off targets that _depend_ on these targets though, that is the whole point! You should able to declare a target depends on the build step, without having to explicitly manage how the build script is implemented.

`nx-lifecycle` will use the `nx.json` to assign defaults, and will assign defaults to your targets that are assigned there. However that does not guarantee every target is actually executable by every project. You must declare the target in your `project.json` as well. Do not worry about copying `nx-lifecycle`'s targets over.

## Executors

### lifecycle

Will update all `project.json`s and the `nx.json` with declared stages, and wire up dependencies to your bound targets, ensuring that you can reference your abstract targets, Nx will invoke the required targets in dependency order as necessary.

Requires configuration to execute.

#### configuration.stages

Required. No default value.

This is the [high level tasks](#high-level-tasks) logic as described above. Declares the generic targets to be owned by `nx-lifecycle`, which represent workflows with potentially multiple steps.

It is an object, where every key is the name of a stage. The value is another object that optionally has two fields:

- `steps`
  - A list of "sub-stages" to be executed in order. The resulting name of the target will be delimeted by a colon: `stage:step`.
- `dependsOn`
  - Accepts the same values as normal Nx [dependsOn](https://nx.dev/reference/project-configuration#dependson). Used to define relationship between stages, and their dependencies.

#### configuration.bindings

Required. No default value.

This is [bind implementions to tasks](#bind-implementions-to-tasks) logic as described above.

The value is an object mapping, where the key is the name of your specific target implementations (e.g. `nx-tsc` or `mocha`) and the value is the stage it maps to.

__\*\*NOTE\*\*__ If the bound stage has `steps` defined, then you must bind to a specific step. If there are no steps, then you reference the stage directly.

```
{
    "targets": {
        "lifecycle": {
            "executor": "nx-lifecycle:lifecycle",
            "options": {
                "stages": {
                    "build": { 
                        "dependsOn": ["^build"]
                    },
                    "test": {
                        "hooks": ["run", "report"],
                        "dependsOn": ["build"]
                    }
                },
                "bindings": {
                    "nx-tsc": "build",
                    "mocha": "test:run"
                }
            }
        }
    }
}
```

#### configuration.check

`boolean`. Default `true` in CI environments, otherwise `false`.

If `true`, the executor will fail if the `nx.json` or any `project.json` is out of sync with what `nx-lifecycle` believes is correct.

Useful for ensuring that generated configs are up to date in version control before proceeding with deployments.

#### configuration.dryRun

`boolean`. Default `false`.

If `true`, will do everything except actually write the updated config files.

Can still fail if `check` is `true`.
