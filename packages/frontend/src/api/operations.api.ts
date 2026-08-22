import api from './client';

const base = (configId: number) => `/servers/${configId}/operations`;
const sidParams = (sid: number) => ({ params: { sid } });

export const operationsApi = {
  health: (configId: number, sid: number) => api.get(`${base(configId)}/health`, sidParams(sid)).then((r) => r.data),
  audit: (configId: number, limit = 100) => api.get(`${base(configId)}/audit`, { params: { limit } }).then((r) => r.data),
  tempPasswords: (configId: number, sid: number) => api.get(`${base(configId)}/temporary-passwords`, sidParams(sid)).then((r) => r.data),
  addTempPassword: (configId: number, sid: number, data: any) => api.post(`${base(configId)}/temporary-passwords`, { sid, ...data }).then((r) => r.data),
  deleteTempPassword: (configId: number, sid: number, pw: string) => api.delete(`${base(configId)}/temporary-passwords`, { data: { sid, pw } }).then((r) => r.data),
  snapshots: (configId: number, sid: number) => api.get(`${base(configId)}/snapshots`, sidParams(sid)).then((r) => r.data),
  createSnapshot: (configId: number, sid: number, data: any) => api.post(`${base(configId)}/snapshots`, { sid, ...data }).then((r) => r.data),
  restoreSnapshot: (configId: number, sid: number, id: number, data: any) => api.post(`${base(configId)}/snapshots/${id}/restore`, { sid, ...data }).then((r) => r.data),
  deleteSnapshot: (configId: number, sid: number, id: number) => api.delete(`${base(configId)}/snapshots/${id}`, { data: { sid } }).then((r) => r.data),
  apiKeys: (configId: number, sid: number) => api.get(`${base(configId)}/api-keys`, sidParams(sid)).then((r) => r.data),
  addApiKey: (configId: number, sid: number, data: any) => api.post(`${base(configId)}/api-keys`, { sid, ...data }).then((r) => r.data),
  deleteApiKey: (configId: number, sid: number, id: number) => api.delete(`${base(configId)}/api-keys/${id}`, { data: { sid } }).then((r) => r.data),
  queryLogins: (configId: number, sid: number) => api.get(`${base(configId)}/query-logins`, sidParams(sid)).then((r) => r.data),
  addQueryLogin: (configId: number, sid: number, data: any) => api.post(`${base(configId)}/query-logins`, { sid, ...data }).then((r) => r.data),
  deleteQueryLogin: (configId: number, sid: number, cldbid: number) => api.delete(`${base(configId)}/query-logins/${cldbid}`, { data: { sid } }).then((r) => r.data),
};
