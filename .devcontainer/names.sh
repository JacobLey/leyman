# Sourced (POSIX sh) with the working directory anywhere in a checkout. Sets `repo_name` and `worktree_name`, the
# DNS labels of the checkout's URL through tools/local-ingress, `https://<worktree_name>.<repo_name>.localhost`:
# at most 63 characters of `a-z0-9-`, not starting or ending with `-`. The main checkout is `main`.

dns_label() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | cut -c 1-63 | sed 's/^-*//; s/-*$//'
}

names_main_checkout="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
names_checkout="$(git rev-parse --show-toplevel)"
repo_name="$(dns_label "$(basename "$names_main_checkout")")"
worktree_name=main
if [ "$names_checkout" != "$names_main_checkout" ]; then
    worktree_name="$(dns_label "$(basename "$names_checkout")")"
fi
unset names_main_checkout names_checkout
