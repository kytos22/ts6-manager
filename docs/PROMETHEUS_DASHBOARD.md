# Native TS6 metrics dashboard

TS6 beta13 introduces an unauthenticated `/metrics` endpoint (default port 9187).
Enable it only on a trusted network. In Docker, do not publish this port; attach
the manager backend to the server's private network. Other peers on that network
can read metrics. Use a dedicated network or firewall if they are not trusted.

Server startup: `--metrics-enable=1 --metrics-ip=0.0.0.0 --metrics-port=9187`.
This bind is appropriate only inside the isolated container, without a public port
mapping. Keep `--metrics-voice` disabled: the dashboard does not require it.
Preserve authenticated Query access and the previous startup for rollback.

In the manager environment, set `TS_METRICS_CONFIG_IDS` to a comma-separated list
of enabled manager configuration IDs, e.g. `1,2`. `TS_METRICS_PORT` defaults to
9187; all opted-in configurations use that port on their configured TS host.
Recreate only the backend after changing these variables. The local Compose
file passes them through; other deployment methods must explicitly pass them.

The backend reads Prometheus text directly; no Prometheus storage server or
Grafana is installed. Browser requests never supply a scrape target. Metrics
requests inherit authentication and server-access checks. Requests have a 2.5 s
timeout, 2 MiB response limit, no redirects, an 8 s shared cache and in-flight
deduplication. No polling runs without a dashboard request. The browser refreshes
every 10 s while visible and retains 30 samples for that dashboard session only.

Virtual servers are selected using the native `virtualserver_id` identity and
then matched by UID; instance totals are never substituted for virtual-server
metrics. Human/bot clients exclude Query clients. Ping is converted seconds to
milliseconds, loss is explicitly voice loss, traffic is bytes/second. Process
CPU is a counter delta (100% = one core); restart/counter-reset/gap samples are
shown as unavailable, not zero. CPU, RSS, license and Query-session instance
figures are returned only for panel administrators.

If metrics fail or omit required fields, existing Query monitoring is used with
a visible fallback badge. No stale metrics are presented as live. Switching
server or source clears the in-browser graph. No historical metrics database or
background file-manager scans are introduced.

Rollback: unset `TS_METRICS_CONFIG_IDS` and recreate only the manager backend;
restore the saved TS startup and restart that TS6 server to disable the endpoint.
Never reset other containers, networks or Pelican allocations.

Official release: https://github.com/teamspeak/teamspeak6-server/releases/tag/v6.0.0-beta13
