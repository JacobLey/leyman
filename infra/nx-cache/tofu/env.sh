# Sets what `tofu` needs here, from two secrets: the Cloudflare token for OpenTofu, and the state's passphrase.
# Source it, so the variables stay in your shell (and out of its history):
#
#   . ./env.sh
#
# Paste each secret when asked: nothing is shown. The state bucket's S3 credentials are derived from the token, as R2
# defines them: the access key ID is the token's ID, and the secret access key is the SHA-256 of its value
# (https://developers.cloudflare.com/r2/api/tokens/).

nx_cache_env() {
    if [ -z "${TF_VAR_account_id:-}" ]; then
        printf 'Cloudflare account ID: '
        IFS= read -r TF_VAR_account_id || return 1
    fi
    printf 'Cloudflare token for OpenTofu: '
    IFS= read -rs CLOUDFLARE_API_TOKEN || return 1
    echo
    printf 'State passphrase: '
    IFS= read -rs TF_VAR_state_passphrase || return 1
    echo
    if [ "${#TF_VAR_state_passphrase}" -lt 16 ]; then
        echo 'The passphrase must be at least 16 characters' >&2
        return 1
    fi

    # The token's ID, from Cloudflare: a user token (My Profile -> API Tokens), else an account token
    local token_id
    token_id="$(curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        https://api.cloudflare.com/client/v4/user/tokens/verify 2> /dev/null | jq -er '.result.id')" ||
        token_id="$(curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
            "https://api.cloudflare.com/client/v4/accounts/${TF_VAR_account_id}/tokens/verify" 2> /dev/null |
            jq -er '.result.id')" || {
        echo 'Cloudflare did not accept the token: check it, and the account ID' >&2
        return 1
    }

    export TF_VAR_account_id TF_VAR_state_passphrase CLOUDFLARE_API_TOKEN
    export AWS_ACCESS_KEY_ID="${token_id}"
    AWS_SECRET_ACCESS_KEY="$(printf %s "${CLOUDFLARE_API_TOKEN}" | sha256sum | cut -d ' ' -f 1)"
    export AWS_SECRET_ACCESS_KEY
    echo "Ready: token ${token_id}, account ${TF_VAR_account_id}"
}

nx_cache_env
nx_cache_env_status=$?
unset -f nx_cache_env
return "${nx_cache_env_status}"
