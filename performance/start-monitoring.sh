#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_dir}/.." && pwd)"
compose_file="${repository_root}/backend/compose.yml"

wait_http_ready() {
    local name="$1"
    local url="$2"

    for _ in {1..60}; do
        if curl --silent --fail --max-time 2 "${url}" >/dev/null; then
            return 0
        fi
        sleep 1
    done

    echo "${name} was not ready within 60 seconds. Check Docker logs." >&2
    return 1
}

mkdir -p "${repository_root}/backend/build/performance-logs"

docker compose -f "${compose_file}" up -d mysql redis prometheus loki alloy grafana

grafana_endpoint="$(docker compose -f "${compose_file}" port grafana 3000 | head -n 1)"
if [[ ! "${grafana_endpoint}" =~ :([0-9]+)$ ]]; then
    echo 'Could not determine the Grafana port.' >&2
    exit 1
fi
grafana_port="${BASH_REMATCH[1]}"

loki_endpoint="$(docker compose -f "${compose_file}" port loki 3100 | head -n 1)"
if [[ ! "${loki_endpoint}" =~ :([0-9]+)$ ]]; then
    echo 'Could not determine the Loki port.' >&2
    exit 1
fi
loki_port="${BASH_REMATCH[1]}"

alloy_endpoint="$(docker compose -f "${compose_file}" port alloy 12345 | head -n 1)"
if [[ ! "${alloy_endpoint}" =~ :([0-9]+)$ ]]; then
    echo 'Could not determine the Alloy port.' >&2
    exit 1
fi
alloy_port="${BASH_REMATCH[1]}"

wait_http_ready 'Prometheus' 'http://localhost:9090/-/ready'
wait_http_ready 'Loki' "http://localhost:${loki_port}/ready"
wait_http_ready 'Alloy' "http://localhost:${alloy_port}/-/ready"
wait_http_ready 'Grafana' "http://localhost:${grafana_port}/api/health"

echo 'Prometheus ready: http://localhost:9090'
echo "Loki ready: http://localhost:${loki_port}"
echo "Alloy UI: http://localhost:${alloy_port}"
echo "Grafana ready: http://localhost:${grafana_port}"
echo 'Start Spring with the local,performance profiles to collect metrics and logs.'
