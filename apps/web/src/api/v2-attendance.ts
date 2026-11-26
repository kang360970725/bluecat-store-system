import { request } from './http';

export type V2AttendanceWifiNetwork = {
  id: string;
  bssid: string;
  label: string | null;
};

export const getV2AttendanceWifiNetworks = (storeId: string) =>
  request<V2AttendanceWifiNetwork[]>(
    `/v2/attendance/stores/${encodeURIComponent(storeId)}/wifi-networks`
  );

export const saveV2AttendanceWifiNetworks = (
  storeId: string,
  networks: Array<{ bssid: string; label?: string }>
) =>
  request<V2AttendanceWifiNetwork[]>(
    `/v2/attendance/stores/${encodeURIComponent(storeId)}/wifi-networks`,
    { method: 'PATCH', body: JSON.stringify({ networks }) }
  );
