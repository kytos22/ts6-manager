# Local action list

This file tracks pending TS6 Manager work and locally completed improvements
that must be preserved when rebasing onto a future upstream release.

## Pending

- No approved management items remain pending after the Operations release.
- Preserve the product invariant that Channels and Clients remain separate
  user-facing sections even when they share internal action components.

## Completed recently

- The Channels card header replaces the spacer count with a live countdown to
  the next ten-second channel/client refresh and switches to a spinning
  `Refreshing...` state while either query is active. TS6 narrow grows from 36
  to 40 rem; all property/action rails remain fixed, so the entire four-rem
  increase is absorbed by the flexible channel identity and banner lane.
- Channel, spacer, and connected-client rows share the exact same right-side
  geometry: a 7.25 rem property reservation followed by the 2 rem action cell,
  so every options button forms one vertical column. Channel and spacer banners
  now fill their clipped identity lane and apply `object-fit`/`object-position`
  within that real lane, keeping TS6 centering correct in narrow mode instead of
  retaining an intrinsically sized image against the left edge.
- Connected clients in Channels use their live myTeamSpeak profile avatar when
  available, fetched through an authenticated, host-allowlisted, size-limited
  backend proxy with verified image signatures and a five-minute cache. Initials
  remain the fallback. Voice presence mirrors TeamSpeak state: available is a
  blue dot, active speech is green, and AFK, microphone mute, or output mute use
  distinct status icons derived from the live `clientlist -away -voice` fields.
- Channel rows use three physically separate flex lanes: a clipped flexible
  channel identity, fixed-width properties (ID, password, population), and
  fixed-width actions. Channel indentation and banners now live entirely
  inside the clipped identity lane, so neither can paint beneath the opaque
  properties/action rails at any UI scale. Channel ID, password state, client
  count, and actions each have a stable cell with their own vertical divider.
  The security cell always identifies its state with an amber closed lock or a
  subdued green open lock, and zero-client states retain their column so every
  row remains aligned. Spacer and connected-client rows retain their own
  reserved action rail. The complete TS6 narrow card uses the available width
  up to its limit and is horizontally centered in the panel.
- The media pipeline now uses a pinned yt-dlp nightly binary with SHA-256
  verification, shared command execution, coordinated hard timeouts and full
  diagnostics. Progressive playback keeps memory bounded for long media,
  prefers native Opus when available, and retains the JavaScript encoder as a
  fallback. Existing radio, direct URL, separate YouTube audio/video stream,
  queue, playlist, and reconnect behavior is preserved.
- Spotify track and album links can be resolved through the Spotify metadata
  API and matched to YouTube for playback. The integration is disabled until
  credentials are configured and never attempts to download audio from
  Spotify itself.
- Authentication includes a configurable password policy, TOTP MFA with
  recovery codes, optional SAML SSO with one-time code handoff and assertion
  validation, and persistent per-user language selection. SAML remains
  disabled by default so existing local accounts continue to work unchanged.
- The UI supports English, Spanish, French, German, and Italian. Translation
  infrastructure and dictionaries are maintained without replacing the
  customized Channels, Clients, Operations, icon, logging, and scale behavior.
- The connection journal records web and TeamSpeak connection events with
  offline GeoIP lookup and configurable retention. IP visibility and journal
  administration remain restricted to administrators.
- Optional Discord commands, notifications and live statistics are available
  from Settings. Discord and Spotify integrations are both disabled by default
  and do not connect externally until an administrator supplies credentials
  and enables them.

- Channels has a denser client-like visual hierarchy with live summary cards,
  clearer channel/client states and native spacer interpretation. Only root,
  permanent channels qualify; `[cspacer]`, `[lspacer]`, `[rspacer]`,
  `[*spacer]`, blank spacers and Markdown-style divider payloads render with
  their respective alignment or repetition while admin actions remain
  available on hover. Channel banners are requested efficiently with
  `channellist -banners` and rendered behind their channel row using the TS6
  no-adjustment, stretch or preserve-aspect mode plus a readability overlay.
  On an HTTP panel, a failed HTTPS banner may retry over HTTP. This supports
  legacy file hosts whose HTTPS endpoint rejects SNI while their HTTP endpoint
  still serves the image normally.
- Reliable channel messages use a short-lived isolated WebQuery connection,
  move only that Query identity into the selected channel, send to its current
  channel, and immediately close it. The shared panel connection and real
  clients are never moved.
- Virtual-server settings include the four documented transfer controls:
  upload/download bandwidth in bytes per second and upload/download quota in
  MB, with zero documented in the UI as unlimited.
- Operations provides an administrator-only temporary-password manager,
  encrypted snapshot library with keep-files restore protection and explicit
  RESTORE confirmation, WebQuery API-key and SSH Query-login management,
  connection health, operational alerts, a live TeamSpeak event feed, and an
  append-only administrator action trail that deliberately excludes request
  bodies and secrets.

- Server Groups now provides administrator-only create, rename, copy, delete,
  inline icon assignment, searchable database member add/remove, and deep links
  into its selected permission layer. Default and non-regular groups are
  protected from deletion.
- Channel Groups now provides administrator-only create, rename, copy, delete,
  inline icon assignment, client/channel assignments, assignment inspection,
  and deep links into its selected permission layer. Copies reproduce the
  source permissions and roll back the new group if copying fails; default and
  non-regular groups are protected from deletion.
- Privilege keys identify their server group or channel group and target
  channel by name.
- Custom group and channel icons used by privilege keys are downloaded through
  authenticated TeamSpeak file transfer and cached with SHA-256 ETag
  revalidation.
- Viewer access is enforced end to end: server lists and server details are
  limited to explicit assignments, and persisted selections are cleared when
  they are no longer accessible.
- Administrators can assign servers when creating or editing viewer accounts.
- Global bot, widget, and WebSocket data is restricted to administrators, and
  the panel prevents removing the last active administrator or one's own
  administrator access.
- The log line selector paginates TeamSpeak's 100-line Query limit and returns
  all available entries when 250 or 500 are requested.
- Actual custom TeamSpeak icons are shown in the client, server-group,
  channel-group, channel, and privilege-key lists through one cached component.
- The icon manager lists and searches the server library, uploads supported
  images with TeamSpeak-compatible CRC32 IDs, assigns or replaces icons on the
  virtual server, server groups, channel groups, and connected clients,
  removes assignments, and deletes files with confirmation.
- Direct channel icon assignment is intentionally disabled in the manager:
  this TS6 build advertises channel_icon_id in Query help but returns error
  1538 for an idempotent channeledit request. Existing channel icons remain
  visible and downloadable.
- The channel tree supports dragging connected clients to another channel and
  provides per-client actions for moving, private messaging, poking, kicking,
  and a confirmed one-hour ban.
- Channels offers a persistent TS6-style narrow tree mode alongside the full
  width layout. Channel banners are centered inside the usable row area after
  each subchannel's indentation, matching the visual alignment of the native
  client instead of centering against the whole panel width.
- Channel management includes an advanced editor for identity, description,
  Opus codec and quality, encryption, client/family limits, needed talk power,
  permanence, default-channel behavior, delete delay, banner, and phonetic
  name. Its action menu also links directly to channel permissions and can move
  all connected clients safely while reporting partial failures.
- Clients has its own management workflow with technical details, current
  channel, movement, server-group add/remove, channel-group assignment, direct
  permissions, personal icon assignment, private message, poke, confirmed
  channel/server kicks, and configurable confirmed bans. Viewers can inspect
  details but all mutations remain administrator-only.
- Client details preserve the live connection ID after `clientinfo` loads, so
  delayed actions cannot generate `clients/NaN` requests. Server-group
  assignment offers only regular assignable groups; backend validation also
  rejects template and Query groups before contacting TeamSpeak.
- Client profile management can edit the stored description (validated to the
  TS6 200-character limit) and the connected client's talker flag through a
  narrowly whitelisted administrator-only backend route.
- Virtual Servers has an administrator-only settings editor for identity,
  password, welcome and host messages, slots, default groups, encryption,
  identity/client-version requirements, anti-flood thresholds, banner, host
  button, and logging. It submits only modified fields; start and stop are
  administrator-only and require explicit confirmation before execution.
- The administrator/viewer control audit is complete. Sensitive pages are
  hidden in navigation and protected by AdminRoute, while their write routes
  also require the admin role in the backend. Viewer-visible Channels and
  Clients retain read-only inspection but gate every mutation behind isAdmin.
- Every account has a persistent responsive interface scale (90%, 100%, 110%,
  125%, or 140%) based on the root UI size. It enlarges rem-based text and
  controls without changing the browser viewport or breaking portal menus. A
  compact selector beside the light/dark toggle mirrors the Settings control.
- Client action menus in Channels include a direct Manage client deep link
  that opens the matching live client in the dedicated Clients workflow.
