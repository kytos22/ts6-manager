import api from './client';

const base = (configId: number, sid: number) =>
  `/servers/${configId}/vs/${sid}/files`;

export const iconsApi = {
  list: (configId: number, sid: number) =>
    api.get(`${base(configId, sid)}/icons`).then((r) => r.data),
  image: (configId: number, sid: number, iconId: string) =>
    api.get(`${base(configId, sid)}/icon/${encodeURIComponent(iconId)}`, {
      responseType: 'blob',
    }).then((r) => r.data as Blob),
  upload: (configId: number, sid: number, data: string, fileName: string) =>
    api.post(`${base(configId, sid)}/icons`, { data, fileName }).then((r) => r.data),
  assign: (
    configId: number,
    sid: number,
    data: { iconId: string; targetType: string; targetId?: number },
  ) => api.post(`${base(configId, sid)}/icons/assign`, data).then((r) => r.data),
  delete: (configId: number, sid: number, iconId: string) =>
    api.delete(`${base(configId, sid)}/icons/${encodeURIComponent(iconId)}`),
};
