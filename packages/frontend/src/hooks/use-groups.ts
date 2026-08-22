import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsApi } from '../api/groups.api';
import { useServerStore } from '../stores/server.store';

export function useServerGroups() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useQuery({
    queryKey: ['server-groups', c, s],
    queryFn: () => groupsApi.serverGroups(c!, s!),
    enabled: !!c && !!s,
  });
}

export function useChannelGroups() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useQuery({
    queryKey: ['channel-groups', c, s],
    queryFn: () => groupsApi.channelGroups(c!, s!),
    enabled: !!c && !!s,
  });
}

export function useServerGroupMembers(sgid: number | null) {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useQuery({
    queryKey: ['server-group-members', c, s, sgid],
    queryFn: () => groupsApi.serverGroupMembers(c!, s!, sgid!),
    enabled: !!c && !!s && !!sgid,
  });
}

export function useCreateServerGroup() {
  const qc = useQueryClient();
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useMutation({
    mutationFn: (name: string) => groupsApi.createServerGroup(c!, s!, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['server-groups'] }),
  });
}

export function useDeleteServerGroup() {
  const qc = useQueryClient();
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useMutation({
    mutationFn: (sgid: number) => groupsApi.deleteServerGroup(c!, s!, sgid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['server-groups'] }),
  });
}

function useGroupMutation<T>(mutationFn: (data: T) => Promise<any>, queryKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
  });
}

export function useRenameServerGroup() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useGroupMutation(({ sgid, name }: { sgid: number; name: string }) => groupsApi.renameServerGroup(c!, s!, sgid, name), 'server-groups');
}

export function useCopyServerGroup() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useGroupMutation(({ sgid, name }: { sgid: number; name: string }) => groupsApi.copyServerGroup(c!, s!, sgid, name), 'server-groups');
}

export function useAddServerGroupMember() {
  const qc = useQueryClient();
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useMutation({
    mutationFn: ({ sgid, cldbid }: { sgid: number; cldbid: number }) => groupsApi.addServerGroupMember(c!, s!, sgid, cldbid),
    onSuccess: (_, data) => qc.invalidateQueries({ queryKey: ['server-group-members', c, s, data.sgid] }),
  });
}

export function useRemoveServerGroupMember() {
  const qc = useQueryClient();
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useMutation({
    mutationFn: ({ sgid, cldbid }: { sgid: number; cldbid: number }) => groupsApi.removeServerGroupMember(c!, s!, sgid, cldbid),
    onSuccess: (_, data) => qc.invalidateQueries({ queryKey: ['server-group-members', c, s, data.sgid] }),
  });
}

export function useCreateChannelGroup() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useGroupMutation((name: string) => groupsApi.createChannelGroup(c!, s!, name), 'channel-groups');
}

export function useDeleteChannelGroup() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useGroupMutation((cgid: number) => groupsApi.deleteChannelGroup(c!, s!, cgid), 'channel-groups');
}

export function useRenameChannelGroup() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useGroupMutation(({ cgid, name }: { cgid: number; name: string }) => groupsApi.renameChannelGroup(c!, s!, cgid, name), 'channel-groups');
}

export function useCopyChannelGroup() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useGroupMutation(({ cgid, name }: { cgid: number; name: string }) => groupsApi.copyChannelGroup(c!, s!, cgid, name), 'channel-groups');
}

export function useChannelGroupClients(cgid: number | null) {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useQuery({
    queryKey: ['channel-group-clients', c, s, cgid],
    queryFn: () => groupsApi.channelGroupClients(c!, s!, cgid!),
    enabled: !!c && !!s && !!cgid,
  });
}

export function useAssignChannelGroup() {
  const qc = useQueryClient();
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  return useMutation({
    mutationFn: ({ cgid, cid, cldbid }: { cgid: number; cid: number; cldbid: number }) => groupsApi.assignChannelGroup(c!, s!, cgid, cid, cldbid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel-group-clients'] }),
  });
}
