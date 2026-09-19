# TS6 beta13 compatibility

Pin the official server package to `v6.0.0-beta13`, verifying its published
SHA-256. For Pelican installations using a generic Debian image, update the
TeamSpeak package in the persistent volume and the server's `TS_VERSION` setting.
Updating the container base image alone does not update TeamSpeak.

Before replacement, retain the old package, configuration, server identity,
channel files and a consistent database backup. SQLite WAL must be accounted for.
Use the server's normal Pelican stop/start lifecycle. Preserve existing ports.
Rollback must restore the pre-upgrade database as well as the old executable
and libraries when database migrations have occurred.

To retain authenticated-only Query access, add these server startup flags:

```
--query-http-allow-guest=0 --query-ssh-allow-guest=0
```

Keep existing API keys and SSH credentials. Prometheus metrics remain disabled
unless separately configured on a restricted internal interface.

The panel verifies version, authenticated Query identity, server listing and
API-key-management permission using read-only commands. These probes do not
guarantee permission for every action; TeamSpeak still authorizes each command.
The Settings Test button honors `success: false`. Operations and the snapshot
restore dialog warn on affected pre-beta13 TS6 versions and unknown versions.

After upgrading, verify authenticated HTTP/SSH Query, rejected guest access,
voice/file-transfer ports, channel/group counts, icons, and music-bot reconnect.
Do not test snapshot restoration against the live production virtual server.
Existing file-summary-on-entry behavior and UI customizations are unchanged.

Reference: https://github.com/teamspeak/teamspeak6-server/releases/tag/v6.0.0-beta13
