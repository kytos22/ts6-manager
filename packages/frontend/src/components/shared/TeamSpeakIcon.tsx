import { useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon } from 'lucide-react';
import { iconsApi } from '@/api/icons.api';
import { cn } from '@/lib/utils';

export const downloadableIconId = (value: unknown): string | null => {
  const iconId = Number(value);
  if (!Number.isInteger(iconId) || iconId === 0) return null;
  const unsigned = iconId < 0 ? iconId + 4294967296 : iconId;
  return unsigned > 1000 && unsigned <= 4294967295 ? String(unsigned) : null;
};

export function TeamSpeakIcon({
  configId,
  sid,
  iconId,
  className,
  fallback,
  title,
}: {
  configId: number;
  sid: number;
  iconId: unknown;
  className?: string;
  fallback?: ReactNode;
  title?: string;
}) {
  const normalizedId = downloadableIconId(iconId);
  const { data } = useQuery({
    queryKey: ['teamspeak-icon', configId, sid, normalizedId],
    queryFn: () => iconsApi.image(configId, sid, normalizedId!),
    enabled: !!normalizedId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const objectUrl = useMemo(() => data ? URL.createObjectURL(data) : null, [data]);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  if (!objectUrl) {
    return <>{fallback ?? <ImageIcon className={cn('h-4 w-4 text-muted-foreground', className)} />}</>;
  }
  return (
    <img
      src={objectUrl}
      alt=""
      title={title || `TeamSpeak icon ${normalizedId}`}
      className={cn('h-4 w-4 object-contain shrink-0', className)}
    />
  );
}
