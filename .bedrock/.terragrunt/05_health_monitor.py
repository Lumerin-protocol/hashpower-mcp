"""mcp /health is up and reports the environment this stack is supposed to serve."""

import json
import os
import urllib.request

import boto3

HEALTH_URL = os.environ["HEALTH_URL"]
EXPECTED_ENV = os.environ["EXPECTED_ENV"]
EXPECTED_NETWORK = os.environ["EXPECTED_NETWORK"]
EXPECTED_NAME = os.environ["EXPECTED_NAME"]
PACKAGES = [
    "@hashpower/oracle-abi",
    "@hashpower/collateral-abi",
    "@hashpower/futures-abi",
    "@hashpower/perps-abi",
]
CW_NAMESPACE = os.environ.get("CW_NAMESPACE", "HashpowerMcp")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "dev")

cloudwatch = boto3.client("cloudwatch")


def lambda_handler(event, context):
    health_up = 0
    payload_ok = 0
    try:
        req = urllib.request.Request(HEALTH_URL, headers={"User-Agent": "hashpower-mcp-monitor"})
        with urllib.request.urlopen(req, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
            health_up = 1 if response.status == 200 else 0
        abi = body.get("abi") or {}
        payload_ok = 1 if (
            health_up
            and body.get("ok") is True
            and body.get("env") == EXPECTED_ENV
            and body.get("network") == EXPECTED_NETWORK
            and body.get("name") == EXPECTED_NAME
            and all(abi.get(name) for name in PACKAGES)
        ) else 0
    except Exception as exc:
        print(f"health failed: {exc}")

    print(f"up={health_up} payload={payload_ok}")
    dims = [{"Name": "Environment", "Value": ENVIRONMENT}]
    cloudwatch.put_metric_data(
        Namespace=CW_NAMESPACE,
        MetricData=[
            {"MetricName": "health_up", "Value": health_up, "Unit": "Count", "Dimensions": dims},
            {"MetricName": "health_payload_ok", "Value": payload_ok, "Unit": "Count", "Dimensions": dims},
        ],
    )
    return {"healthUp": health_up, "payloadOk": payload_ok}
