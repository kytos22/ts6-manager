import { TeamSpeakIcon } from './TeamSpeakIcon';

interface GroupInfo {
  name?: string;
  iconid?: string | number;
}

export function ClientTeamSpeakIcons({
  client,
  configId,
  sid,
  serverGroups,
  channelGroups,
}: {
  client: any;
  configId: number;
  sid: number;
  serverGroups: Map<string, GroupInfo>;
  channelGroups: Map<string, GroupInfo>;
}) {
  const icons: Array<{ key: string; iconId: unknown; title: string }> = [];
  if (Number(client.client_icon_id) !== 0) {
    icons.push({ key: 'client', iconId: client.client_icon_id, title: 'Personal client icon' });
  }

  for (const groupId of String(client.client_servergroups || '').split(',').filter(Boolean)) {
    const group = serverGroups.get(groupId);
    if (group && Number(group.iconid) !== 0) {
      icons.push({
        key: `sg-${groupId}`,
        iconId: group.iconid,
        title: group.name || `Server group ${groupId}`,
      });
    }
  }

  const channelGroupId = String(client.client_channel_group_id || '');
  const channelGroup = channelGroups.get(channelGroupId);
  if (channelGroup && Number(channelGroup.iconid) !== 0) {
    icons.push({
      key: `cg-${channelGroupId}`,
      iconId: channelGroup.iconid,
      title: channelGroup.name || `Channel group ${channelGroupId}`,
    });
  }

  if (icons.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {icons.map((icon) => (
        <TeamSpeakIcon
          key={icon.key}
          configId={configId}
          sid={sid}
          iconId={icon.iconId}
          title={icon.title}
          className="h-4 w-4"
        />
      ))}
    </span>
  );
}
