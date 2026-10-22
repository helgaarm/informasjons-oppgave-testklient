#!/usr/bin/env bash
set -euo pipefail

# Gitleaks CLI from its official release, verified against a pinned SHA-256.
# This script is intended for Linux x86_64 (the GitHub-hosted CI runner).
version='8.30.1'
checksum='551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'
archive="gitleaks_${version}_linux_x64.tar.gz"
scan_dir="$(mktemp -d)"
trap 'rm -rf "$scan_dir"' EXIT

curl --fail --location --silent --show-error --proto '=https' --tlsv1.2 \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/${archive}" \
  --output "$scan_dir/$archive"
printf '%s  %s\n' "$checksum" "$scan_dir/$archive" | sha256sum --check --status
tar --extract --gzip --file "$scan_dir/$archive" --directory "$scan_dir" gitleaks
# Check the app-specific rule with a synthetic value before scanning history.
for field in HELSEID_TTT_API_KEY apiKey X-Auth-Key; do
  status=0
  printf '"%s": "%s-%s-%s-%s-%s"\n' "$field" 11111111 2222 4333 8444 555555555555 | \
    "$scan_dir/gitleaks" stdin --config .gitleaks.toml --redact --no-banner > /dev/null 2>&1 || status=$?
  if [ "$status" -ne 1 ]; then
    echo "Secret rule self-test failed for $field (exit $status)." >&2
    exit 1
  fi
done
"$scan_dir/gitleaks" git --redact --no-banner --log-opts='--all' .
